# Component Loggers Design

**Date:** 2026-05-08
**Branch:** logging/mornitoring
**Status:** Approved

## Problem

All application code shares a single `"AI-Lab-Agent"` logger. There is no way to:
- Filter log lines by component (guardrail vs. prompts vs. api) in Kibana
- Set log level per component in production
- See guardrail pass events (only blocks are logged today)
- Get automatic per-request API metrics (method, path, status, latency)

## Goals

1. Named sub-loggers per component — filterable in Kibana via `logger` field
2. FastAPI middleware that logs every request/response automatically
3. Guardrail orchestrator emits one structured summary event per request (pass or block)
4. Prompts module uses its own named logger
5. Services stay span-only (no change)

## Non-Goals

- New log files or new handlers
- Per-component `IndustryLogger` class instances
- Changing service classes (GroqLLM, GroqSTT, ElevenLabsTTS, AzureAssessment)
- Changing the `AuditLogger`

## Architecture

### Logger Hierarchy

```
AI-Lab-Agent                  ← existing parent (handlers, level here)
├── AI-Lab-Agent.api          ← middleware + route context
├── AI-Lab-Agent.guardrail    ← input/output guardrail checks
└── AI-Lab-Agent.prompts      ← prompt_builder cache + composition
```

All child loggers inherit the parent's file and console handlers. No new log files. The `logger` field in each log line carries the full child name, enabling Kibana filtering without index mapping changes.

### Logger Factory

**File:** `app/core/logger.py` — add one function:

```python
def get_logger(component: str) -> logging.Logger:
    """Return a named child logger: AI-Lab-Agent.<component>"""
    return logging.getLogger(f"AI-Lab-Agent.{component}")
```

The existing `logger` singleton is unchanged. All existing call sites keep working.

---

## Component Designs

### 1. API Logging Middleware

**New file:** `app/core/logging_middleware.py`

A Starlette `BaseHTTPMiddleware` registered in `app/main.py`.

**Behavior:**
- On request start: log `INFO` with `method`, `path`, `client_ip`, `trace_id`
- On request end: log `INFO` with `method`, `path`, `status_code`, `latency_ms`
- On unhandled exception: log `ERROR` with `exc_type`, `exc_message`, re-raise

**Logger:** `get_logger("api")` — all lines carry `logger: AI-Lab-Agent.api`

**Registration in `app/main.py`:**
```python
from app.core.logging_middleware import LoggingMiddleware
app.add_middleware(LoggingMiddleware)
```

**Coexistence with inline route logs:** The middleware logs path/status/latency. Route handlers (e.g., `chat.py`) log business context (user_id, conv_id). No duplication.

---

### 2. Guardrail Summary Logger

**Files changed:**
- `app/guardrails/input/__init__.py` — `InputGuardrails.check()`
- `app/guardrails/output/__init__.py` — `OutputGuardrails.check()`

**Module-level logger:**
```python
from app.core.logger import get_logger
_log = get_logger("guardrail")
```

**Input guardrail event** (emitted after span exits — pass or block):

```json
{
  "event": "guardrail.input.check",
  "result": "pass",
  "user_id": "...",
  "input_length": 42
}
```

On block:
```json
{
  "event": "guardrail.input.check",
  "result": "block",
  "code": "INJECTION_DETECTED",
  "matched_pattern": "ignore\\s+previous\\s+instructions",
  "user_id": "...",
  "input_length": 42
}
```

The `GuardrailException` carries `code` and `reason`. The `matched_pattern` is available from `InjectionDetector` — the exception `reason` field already contains the matched pattern string.

**Output guardrail event:**
```json
{
  "event": "guardrail.output.check",
  "result": "pass",
  "pii_redacted": false,
  "output_length": 128
}
```

**Level:** INFO for pass, WARNING for block (consistent with existing `chat.py` warning on block).

---

### 3. Prompts Logger

**File changed:** `app/prompts/prompt_builder.py`

Replace:
```python
from app.core.logger import logger
```
With:
```python
from app.core.logger import get_logger
logger = get_logger("prompts")
```

All existing `logger.debug(...)` and `logger.exception(...)` calls in this file are unchanged. They now carry `logger: AI-Lab-Agent.prompts` automatically.

---

## Data Flow

```
HTTP Request
     │
     ▼
LoggingMiddleware (AI-Lab-Agent.api)
  → request_start: method, path, client_ip
     │
     ▼
Route handler (chat.py)
  → inline logger.info: user_id, input_mode, conv_id   [AI-Lab-Agent]
     │
     ▼
InputGuardrails.check()
  → span_context("guardrail.input")                     [telemetry span]
  → guardrail.input.check event                         [AI-Lab-Agent.guardrail]
     │
     ▼
prompt_builder.build_system_prompt()
  → cache hit/miss, layer composition                   [AI-Lab-Agent.prompts]
     │
     ▼
run_langraph_agent() → spans for llm/stt/tts            [telemetry spans]
     │
     ▼
OutputGuardrails.check()
  → span_context("guardrail.output")                    [telemetry span]
  → guardrail.output.check event                        [AI-Lab-Agent.guardrail]
     │
     ▼
AuditLogger.log()                                       [AI-Lab-Agent]
     │
     ▼
LoggingMiddleware
  → request_end: status_code, latency_ms                [AI-Lab-Agent.api]
```

---

## Files Changed

| File | Change |
|------|--------|
| `app/core/logger.py` | Add `get_logger(component)` factory function |
| `app/core/logging_middleware.py` | New — `LoggingMiddleware` class |
| `app/main.py` | Register `LoggingMiddleware` |
| `app/guardrails/input/__init__.py` | Add `_log = get_logger("guardrail")`, emit summary event |
| `app/guardrails/output/__init__.py` | Add `_log = get_logger("guardrail")`, emit summary event |
| `app/prompts/prompt_builder.py` | Switch to `get_logger("prompts")` |

---

## Kibana Queries

After this change, useful Kibana filters:

| Goal | Filter |
|------|--------|
| All guardrail blocks | `logger: AI-Lab-Agent.guardrail AND result: block` |
| Injection attempts | `logger: AI-Lab-Agent.guardrail AND code: INJECTION_DETECTED` |
| Prompt cache misses | `logger: AI-Lab-Agent.prompts AND message: *cache MISS*` |
| Slow API requests | `logger: AI-Lab-Agent.api AND latency_ms > 2000` |
| All 4xx/5xx responses | `logger: AI-Lab-Agent.api AND status_code >= 400` |

---

## Testing

- `LoggingMiddleware`: assert `request_start` and `request_end` log lines emitted for a test request; assert `ERROR` on exception
- `InputGuardrails.check()`: assert pass event emitted on clean input; assert block event with `code` and `matched_pattern` on injection input
- `OutputGuardrails.check()`: assert pass event; assert `pii_redacted: true` when PII present
- `prompt_builder`: existing tests cover behavior; assert logger name is `AI-Lab-Agent.prompts`

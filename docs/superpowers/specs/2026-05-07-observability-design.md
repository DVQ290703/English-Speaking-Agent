# Observability Design — English Speaking Agent

**Date:** 2026-05-07  
**Approach:** Context-propagated structured tracing (Approach B)  
**Stack:** VEK (Vector → Elasticsearch → Kibana) + Prometheus + Grafana  

---

## Context

The app is a FastAPI + LangGraph AI voice coaching application using Groq LLM (llama-3.3-70b-versatile), Groq Whisper STT, ElevenLabs TTS, and Azure pronunciation assessment. It has an existing `IndustryLogger` (JSON-capable) and `AuditLogger` (guardrails) — both are extended, not replaced.

VEK stack will be deployed later in K8s. Vector will tail structured JSON logs from the app. Prometheus `/metrics` endpoint will be scraped by K8s Prometheus operator.

---

## Decisions

- **No OpenTelemetry SDK** — custom context propagation via Python `contextvars` is sufficient and avoids OTel collector infra dependency. OTel-migratable later since concepts map 1:1.
- **No tests** for observability layer.
- **No PII redaction** — deferred as future enhancement.
- **No LLM-as-judge** — deferred as future enhancement; metrics registered as placeholders only.
- **Percentile calculations (P50/P95/P99)** done by Grafana/Kibana dashboards, not application code.

---

## Section 1: Core Infrastructure

### `app/core/telemetry.py` (new)

Single source of truth for trace context. Uses Python `contextvars` (async-safe) to propagate context for the lifetime of a request.

```
TraceContext fields (contextvars):
  - trace_id: str        — uuid4, generated per request by middleware
  - session_id: str      — conversation_id from request
  - user_id: str         — from JWT
  - environment: str     — from settings (development/production)
```

Exposes:
- `get_trace_context() → dict` — returns current context as dict for log injection
- `set_trace_context(trace_id, session_id, user_id)` — called by middleware on request start
- `clear_trace_context()` — called by middleware on request end

### Extended `IndustryLogger`

Add `log_span(span_name, span_kind, duration_ms, status, **extra)` method that automatically injects all trace context fields from `contextvars`. No manual field passing at call sites.

### `@trace_span(name, kind)` decorator

Wraps any async function:
1. Records `start_time`
2. Calls the wrapped function
3. On success: emits one structured JSON span log entry
4. On error: emits error span with `exception_type`, `exception_message`, `stack_trace` in `extra`
5. Updates Prometheus metrics (same code path)

---

## Section 2: Instrumentation Points

| Layer | File | What's instrumented | Fields captured |
|---|---|---|---|
| **Request middleware** | `app/main.py` | Every inbound request | `trace_id` generated, context set, `X-Trace-ID` response header added |
| **LLM** | `app/services/groq_llm.py` | `generate_response()`, `generate_response_with_grammar()` | `model`, `prompt_tokens`, `completion_tokens`, `latency_ms` |
| **STT** | `app/services/groq_stt.py` | `transcribe()` | `model`, `audio_duration_ms`, `latency_ms` |
| **TTS** | `app/services/elevenlabs_tts.py` | `synthesize()` | `model`, `voice_id`, `text_length`, `latency_ms` |
| **Assessment** | `app/services/azure_assessment.py` | `assess()` | `latency_ms`, `fluency_score`, `accuracy_score` |
| **Input guardrails** | `app/guardrails/input/` | Each check | `check_name`, `decision` (allowed/blocked), `reason`, `latency_ms` |
| **Output guardrails** | `app/guardrails/output/` | Each check | `check_name`, `decision`, `reason`, `latency_ms` |

The existing `AuditLogger` (`app/guardrails/audit/logger.py`) is extended to include `trace_id` and `session_id` in every audit entry — additive fields only, no structural change.

---

## Section 3: Structured Log Format

Every log entry (spans, errors, audit events) follows this JSON schema:

```json
{
  "timestamp": "2026-05-07T10:23:45.123Z",
  "level": "INFO",
  "environment": "production",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "conv_abc123",
  "user_id": "user_xyz",
  "span_name": "llm.generate_response",
  "span_kind": "llm|stt|tts|guardrail|api",
  "duration_ms": 342,
  "status": "ok|error",
  "model": "llama-3.3-70b-versatile",
  "prompt_tokens": 512,
  "completion_tokens": 128,
  "total_tokens": 640,
  "estimated_cost_usd": 0.00032,
  "error": null,
  "extra": {}
}
```

**Key decisions:**
- `session_id` = `conversation_id` from the DB (ties multi-turn requests together in Kibana)
- `estimated_cost_usd` computed from `total_tokens × model_price_per_token` via a static pricing lookup table in `telemetry.py`
- `extra` holds span-specific fields (e.g., guardrail `reason`, STT `audio_duration_ms`, TTS `voice_id`, Azure scores)
- Error spans include `exception_type`, `exception_message`, full `stack_trace` in `extra`
- Non-LLM spans omit token/cost fields (set to `null`)

---

## Section 4: Prometheus Metrics

### `app/core/metrics.py` (new)

All counters and histograms registered once at app startup.

| Metric | Type | Labels |
|---|---|---|
| `llm_requests_total` | Counter | `model`, `endpoint`, `status` |
| `llm_tokens_total` | Counter | `model`, `token_type` (input/output) |
| `llm_cost_usd_total` | Counter | `model`, `endpoint` |
| `llm_latency_seconds` | Histogram | `model`, `endpoint` |
| `stt_requests_total` | Counter | `model`, `status` |
| `stt_latency_seconds` | Histogram | `model` |
| `tts_requests_total` | Counter | `model`, `status` |
| `tts_latency_seconds` | Histogram | `model` |
| `guardrail_decisions_total` | Counter | `check_name`, `decision` |
| `api_request_duration_seconds` | Histogram | `endpoint`, `method`, `status_code` |
| `answer_relevance_score` | Histogram | `model` — **placeholder, never updated** |
| `hallucination_rate_total` | Counter | `model` — **placeholder, never updated** |

**Integration:**
- `prometheus-fastapi-instrumentator` auto-instruments all FastAPI routes (provides `api_request_duration_seconds` for free)
- Custom metrics updated inside `@trace_span` decorator — same code path that emits logs
- `/metrics` endpoint exposed on FastAPI app as Prometheus scrape target
- P50/P95/P99 computed by Grafana using `histogram_quantile()` — not in application code

---

## New Files Summary

| File | Purpose |
|---|---|
| `app/core/telemetry.py` | TraceContext via contextvars, `@trace_span` decorator, cost lookup table |
| `app/core/metrics.py` | All Prometheus counters and histograms |

## Modified Files Summary

| File | Change |
|---|---|
| `app/main.py` | Add trace middleware + Prometheus instrumentator |
| `app/core/logger.py` | Add `log_span()` method with auto trace context injection |
| `app/services/groq_llm.py` | Apply `@trace_span` to LLM methods |
| `app/services/groq_stt.py` | Apply `@trace_span` to transcribe |
| `app/services/elevenlabs_tts.py` | Apply `@trace_span` to synthesize |
| `app/services/azure_assessment.py` | Apply `@trace_span` to assess |
| `app/guardrails/input/` | Apply `@trace_span` to each guardrail check |
| `app/guardrails/output/` | Apply `@trace_span` to each guardrail check |
| `app/guardrails/audit/logger.py` | Add `trace_id`, `session_id` to every audit entry |
| `requirements.txt` | Add `prometheus-client`, `prometheus-fastapi-instrumentator` |

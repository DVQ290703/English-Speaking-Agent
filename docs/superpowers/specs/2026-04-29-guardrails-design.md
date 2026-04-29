# AI Agent Safety & Guardrails Design

**Date:** 2026-04-29  
**Branch:** TheAnh_secure  
**System:** English Speaking Coach Voice Agent  
**Status:** Approved for implementation

---

## 1. Scope & Decisions

### In scope
- Input guardrails: validation, prompt injection detection, topic filtering, rate limiting
- Output guardrails: content filtering (toxicity + PII), format validation
- HITL: flags-based, non-blocking, async review queue
- Observability: structured audit logging

### Explicitly out of scope
- **Grounding / RAG check** — system has no retrieval layer; not applicable
- **Confidence scoring** — dropped; HITL routing uses binary flags instead

### Key decisions
| Decision | Choice | Reason |
|---|---|---|
| Architecture | Dedicated `app/guardrails/` package | Clean separation, independently testable, LangGraph unchanged |
| Rate limiting storage | Redis (sliding window) | Production-grade, multi-instance safe |
| Injection detection | Regex + LLM classifier stub | Fast default, pluggable upgrade path |
| HITL model | Non-blocking, flags-based | Voice assistant requires immediate response |
| HITL queue storage | PostgreSQL (`hitl_queue` table) | Reuse existing infra |
| Audit DB | Written but disabled (`AUDIT_DB_ENABLED=false`) | Interface ready, not deployed yet |
| Audit logging | Structured JSON via existing logger | Always on, zero new infra |

---

## 2. Architecture

### Pipeline

```
HTTP Request
  └─► routes.py: chat_respond()
        │
        ├─► InputGuardrails.check(user_input, user_id)
        │     ├── InputValidator       (length, encoding, empty)
        │     ├── RateLimiter          (Redis, 10 req/min/user)
        │     ├── InjectionDetector    (regex + LLM stub)
        │     └── TopicFilter          (English coaching scope)
        │         → raises GuardrailException on block
        │
        ├─► run_langraph_agent()       (unchanged)
        │
        ├─► OutputGuardrails.check(response_text)
        │     ├── ContentFilter        (toxicity block + PII redaction)
        │     └── FormatValidator      (hallucinated URLs, empty response)
        │         → returns (cleaned_text, flags)
        │
        ├─► HITLRouter.route(flags, ...)
        │     → if any flag set: insert into hitl_queue (non-blocking)
        │
        └─► AuditLogger.log(input, output, flags, decisions, latency)
              → structured JSON log (always)
              → audit_logs table (disabled until AUDIT_DB_ENABLED=true)
```

### File structure

```
app/guardrails/
  __init__.py
  exceptions.py                  # GuardrailException(code, reason, retry_after)
  input/
    __init__.py
    validator.py                 # InputValidator
    injection.py                 # InjectionDetector + classifier interface
    topic_filter.py              # TopicFilter
    rate_limiter.py              # RateLimiter (Redis)
  output/
    __init__.py
    content_filter.py            # ContentFilter (toxicity + PII)
    format_validator.py          # FormatValidator (URLs, empty)
  hitl/
    __init__.py
    router.py                    # HITLRouter
    review_api.py                # FastAPI router /api/admin/hitl
  audit/
    __init__.py
    logger.py                    # AuditLogger
```

### Existing files modified
- `app/api/routes.py` — wire guardrails around `run_langraph_agent()`; flags are local variables in `chat_respond()`, not added to AgentState
- `app/core/settings.py` — add Redis URL, rate limit config, guardrail toggles
- `db_schema/schema.sql` — add `hitl_queue` table; add `audit_logs` table (commented out)
- `main.py` — mount HITL review router

---

## 3. Input Guardrails

### 3.1 InputValidator
- Rejects empty / whitespace-only input → `GuardrailException(code="INPUT_INVALID")`
- Rejects input exceeding `MAX_INPUT_CHARS` (default: 2000) → `GuardrailException(code="INPUT_TOO_LONG")`
- Normalizes whitespace: strip + collapse multiple spaces

### 3.2 RateLimiter
- Redis key: `ratelimit:{user_id}`, TTL 60s, sliding window counter
- Limit: `RATE_LIMIT_RPM` (default: 10 requests/min)
- On exceeded: `GuardrailException(code="RATE_LIMITED", retry_after=<seconds>)`
- Runs second (after validator) — cheapest check that requires external I/O

### 3.3 InjectionDetector
- **Interface**: `InjectionClassifier.classify(text: str) → (is_malicious: bool, reason: str)`
- **RegexClassifier** (default): matches patterns including:
  - `ignore (previous|prior|all) instructions`
  - `you are now`
  - `reveal (your )?system prompt`
  - `act as (DAN|an? (unrestricted|unfiltered))`
  - `jailbreak`, `pretend you (are|have no)`
  - `disregard (your|all) (rules|guidelines|instructions)`
  - ~10 additional variants, all case-insensitive
- **LLMClassifier stub**: implements interface, raises `NotImplementedError` — ready to swap in
- Config: `INJECTION_USE_LLM=false` (default)
- On detection: `GuardrailException(code="INJECTION_DETECTED", reason=<matched_pattern>)`

### 3.4 TopicFilter
- Blocks topic categories: hacking, illegal activity, weapons, self-harm, explicit content
- Regex + keyword matching against user input
- Blocklist configurable via `TOPIC_BLOCKLIST` setting (JSON list of patterns)
- On match: `GuardrailException(code="TOPIC_BLOCKED", reason=<category>)`

### 3.5 InputGuardrails (orchestrator)
- Execution order: Validator → RateLimiter → InjectionDetector → TopicFilter
- Rationale: cheapest/fastest checks first; rate limiter before LLM-touching checks

---

## 4. Output Guardrails

Output guardrails never raise — they degrade gracefully (redact or replace).

### 4.1 ContentFilter
**Toxicity detection:**
- Regex + keyword list (slurs, threats, explicit content)
- On match: replace full response with safe fallback message; set flag `is_toxic=True`

**PII redaction (always runs):**
- Email: `[\w.+-]+@[\w-]+\.[\w.]+` → `[EMAIL REDACTED]`
- Phone: common formats (e.g. `+1-800-555-0100`) → `[PHONE REDACTED]`
- API keys: `sk-[A-Za-z0-9]{20,}`, `Bearer [A-Za-z0-9\-._~+/]+=*` → `[KEY REDACTED]`
- Credit cards: Luhn-pattern 16-digit sequences → `[CARD REDACTED]`
- Sets flag `contains_pii=True` if any redaction occurred

Returns `(cleaned_text: str, flags: list[str])`

### 4.2 FormatValidator
- Strips any URL not on the allowlist (allowlist is empty by default — coach never cites URLs)
- Detects responses < 5 characters after cleaning → sets flag `format_invalid=True`
- `format_invalid=True` triggers one retry in `routes.py` (max 1 retry via `GUARDRAIL_MAX_RETRIES=1`)
- If retry also produces invalid format → return safe fallback message

### 4.3 OutputGuardrails (orchestrator)
- Execution order: ContentFilter → FormatValidator
- Returns `(final_text: str, flags: list[str])`

---

## 5. HITL

### HITLRouter
- Receives combined `flags: list[str]` from both input and output guardrails
- Any non-empty flags list → async insert into `hitl_queue`
- Flags: `injection_detected`, `topic_blocked`, `is_toxic`, `contains_pii`, `format_invalid`
- The insert runs after `response_text` is finalized but before the HTTP response is returned — it is a fast synchronous DB write. The user is not waiting for human review; they already have their response.

### `hitl_queue` table
```sql
CREATE TABLE hitl_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    message_id      UUID REFERENCES messages(id),
    user_input      TEXT NOT NULL,
    response_text   TEXT NOT NULL,
    flags           JSONB NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    reviewer_notes  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);
CREATE INDEX idx_hitl_queue_status ON hitl_queue(status);
```

### Review API (`/api/admin/hitl`)
- Auth: `X-Admin-Key: <ADMIN_API_KEY>` header (env var, required)
- `GET /api/admin/hitl/queue?status=pending` — list items
- `POST /api/admin/hitl/{id}/review` — mark reviewed + add notes
- `POST /api/admin/hitl/{id}/dismiss` — mark dismissed

---

## 6. Observability & Audit Logging

### AuditLogger
Emits a structured JSON event for every request:

```json
{
  "event_id": "<uuid>",
  "timestamp": "<ISO8601>",
  "user_id": "<uuid>",
  "conversation_id": "<uuid>",
  "user_input_length": 42,
  "response_length": 180,
  "guardrail_decisions": {
    "input_valid": true,
    "rate_limited": false,
    "injection_detected": false,
    "topic_blocked": false,
    "output_toxic": false,
    "output_pii_redacted": false,
    "format_valid": true
  },
  "flags": [],
  "hitl_queued": false,
  "latency_ms": 423
}
```

Note: raw input/response text is **not** in audit events — only lengths and hashes (SHA-256). Full text lives in `messages` and `hitl_queue` tables only.

### Storage
- **Structured log** (always on): emitted via `app/core/logger.py` at `INFO` level
- **`audit_logs` table** (disabled): controlled by `AUDIT_DB_ENABLED=false`
  - Table DDL is written in `db_schema/schema.sql` but commented out
  - `AuditLogger` checks the flag and skips DB write when disabled

### `audit_logs` table (disabled until `AUDIT_DB_ENABLED=true`)
```sql
-- CREATE TABLE audit_logs (
--     id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     user_id              UUID,
--     conversation_id      UUID,
--     user_input_hash      TEXT NOT NULL,
--     response_text_hash   TEXT NOT NULL,
--     flags                JSONB NOT NULL DEFAULT '[]',
--     guardrail_decisions  JSONB NOT NULL DEFAULT '{}',
--     hitl_queued          BOOLEAN NOT NULL DEFAULT FALSE,
--     latency_ms           INTEGER,
--     created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
-- CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

---

## 7. New Configuration (settings.py additions)

```python
# Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Rate limiting
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "10"))

# Input guardrails
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "2000"))
INJECTION_USE_LLM = os.getenv("INJECTION_USE_LLM", "false").lower() == "true"
TOPIC_BLOCKLIST = json.loads(os.getenv("TOPIC_BLOCKLIST", "[]"))  # extra patterns

# Output guardrails
GUARDRAIL_MAX_RETRIES = int(os.getenv("GUARDRAIL_MAX_RETRIES", "1"))
URL_ALLOWLIST = json.loads(os.getenv("URL_ALLOWLIST", "[]"))

# HITL
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")  # required in prod

# Audit
AUDIT_DB_ENABLED = os.getenv("AUDIT_DB_ENABLED", "false").lower() == "true"
```

---

## 8. Acceptance Criteria

- [ ] Malicious prompts (injection patterns) are blocked before reaching LLM
- [ ] Off-topic inputs (hacking, illegal) are blocked before reaching LLM
- [ ] Users exceeding 10 req/min receive a rate-limit error
- [ ] Toxic LLM output is replaced with a safe fallback before reaching user
- [ ] PII in LLM output is redacted before reaching user
- [ ] Hallucinated URLs are stripped from responses
- [ ] Flagged interactions appear in `hitl_queue` table with correct flags
- [ ] Admin can review/dismiss queue items via `/api/admin/hitl`
- [ ] Every request produces a structured audit log event
- [ ] `audit_logs` table DDL exists in schema but is commented out
- [ ] All guardrail modules have unit tests independent of LangGraph
- [ ] LangGraph pipeline (`pipeline.py`) is unchanged

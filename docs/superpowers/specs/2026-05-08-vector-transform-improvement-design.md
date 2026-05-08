# Vector Transform Improvement — Design Spec

**Date:** 2026-05-08  
**Branch:** logging/mornitoring  
**Scope:** `deployments/vector/vector.yaml` + `docker-compose.yaml`

---

## Problem Summary

The current `parse_json_logs` remap transform has two HIGH-severity issues and two MEDIUM issues:

| # | Severity | Issue |
|---|----------|-------|
| 1 | HIGH | `@timestamp` is never set from log content — Vector uses ingestion time. With `read_from: beginning` and no persisted state dir, every Vector restart re-indexes all logs with `now` as `@timestamp`, corrupting time-range queries in Kibana. |
| 2 | HIGH | The span JSON payload's `timestamp` field (ISO-8601, sub-second precision) is promoted to `.timestamp` but never mapped to `@timestamp`. |
| 3 | MEDIUM | `merge!` aborts the event on any field type conflict, causing silent data loss. |
| 4 | MEDIUM | `level` and `logger` from the log line prefix are discarded — plain logs have no severity field in Elasticsearch. |

Additionally, Vector's `/var/lib/vector` state directory is not volume-mounted, so file-read checkpoints are lost on every container restart.

---

## Design

### Change 1 — Persist Vector state (docker-compose.yaml)

Add a named volume for `/var/lib/vector` and set `VECTOR_DATA_DIR` so file-read checkpoints survive container restarts.

```yaml
# docker-compose.yaml — vector service
vector:
  environment:
    - VECTOR_DATA_DIR=/var/lib/vector
  volumes:
    - ./logs:/logs:ro
    - ./deployments/vector/vector.yaml:/etc/vector/vector.yaml:ro
    - vector_data:/var/lib/vector    # new

# top-level volumes block
volumes:
  vector_data:                        # new
```

**Effect:** Vector reads each log line exactly once, even across restarts. Eliminates duplicate documents and ingestion-time `@timestamp` corruption on replay.

---

### Change 2 — Two-pass transform pipeline (vector.yaml)

Replace the single `parse_json_logs` remap with two chained `remap` steps.

#### Step 1: `extract_prefix`

**Input:** raw `.message` from the file source  
**Purpose:** parse the log line prefix into structured metadata fields

```
2026-05-07 15:53:11 INFO     [AI-Lab-Agent]: <payload>
└─────────────────┘ └────┘   └───────────┘  └───────┘
   @timestamp (s)   level      logger         .payload (temp)
```

Behaviour:
- Regex: `r'^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (?P<level>\S+)\s+\[(?P<logger>[^\]]+)\]:\s+(?P<payload>.+)$'`
- On match: set `@timestamp` (parsed to timestamp, second precision), `.level`, `.logger`, `.payload`
- On no match (malformed line): `.payload = .message` — pass through intact for step 2 to handle

#### Step 2: `parse_payload`

**Input:** `.payload` from step 1  
**Purpose:** classify as span/plain and promote JSON fields

```
.payload is valid JSON object?
├── yes → merge fields flat to root
│         .log_type = "span"
│         if .timestamp exists:
│             @timestamp = parse_timestamp!(.timestamp)   # sub-second precision
│             del(.timestamp)                             # no duplicate alongside @timestamp
│         on merge error: .parse_error = true (event kept, not dropped)
└── no  → .raw_message = .payload
          .log_type = "plain"

del(.payload)          # temp field — not sent to ES
.source_file = .file
```

Key decisions:
- **`@timestamp` override for spans:** the JSON `timestamp` has microsecond precision vs. the prefix's second precision — always prefer it.
- **`del(.timestamp)`:** avoids storing both `.timestamp` and `@timestamp` with the same value, which wastes mapping slots.
- **Error-handled merge:** `merge(., json_payload)` with explicit error check sets `.parse_error = true` instead of dropping the event silently.

---

## Data Flow (after changes)

```
file source (app_logs)
    └── extract_prefix        # @timestamp, level, logger, payload
        └── parse_payload     # log_type, field promotion, @timestamp override for spans
            └── route_by_category
                    ├── audit  →  elasticsearch_audit   (logs-voice_agent.audit-default)
                    ├── span   →  elasticsearch_spans   (logs-voice_agent.spans-default)
                    └── plain  →  elasticsearch_plain   (logs-voice_agent.plain-default)
```

---

## Out of Scope

- Field type coercions (e.g. `to_float(.duration_ms)`) — add only if ES rejects events due to type mismatches
- ECS `service.name` enrichment — not needed for current single-service setup
- Multi-environment namespace support — `default` is sufficient until staging/prod environments exist
- Elasticsearch mapping additions (`level`, `logger`, `conversation_id`, etc.) — separate concern

---

## Files Changed

| File | Change |
|------|--------|
| `docker-compose.yaml` | Add `VECTOR_DATA_DIR` env var + `vector_data` volume mount + volume declaration |
| `deployments/vector/vector.yaml` | Replace `parse_json_logs` with `extract_prefix` + `parse_payload` |

# VEK Stack — Elasticsearch Data Streams Design

**Date:** 2026-05-07
**Approach:** Approach B — Full spec with Docker init containers
**Stack:** Vector → Elasticsearch (data streams) → Kibana

---

## Context

The VEK stack (Vector, Elasticsearch, Kibana) is already running in `docker-compose.yaml`. Vector tails `./logs/*.log` and currently bulk-indexes everything into a single daily index `voice-agent-logs-%Y.%m.%d` with no routing. This creates operational debt: no ILM, mixed log categories, and no controlled field mappings.

This design migrates the pipeline to Elasticsearch data streams with proper routing, ILM, and Kibana data views — all bootstrapped automatically on `docker compose up`.

---

## Decisions

- **Bootstrap via init containers** — `elasticsearch-init` and `kibana-init` services in `docker-compose.yaml` run once on startup, requiring no manual steps.
- **No dashboards in scope** — data streams + data views only; dashboards built manually in Kibana UI.
- **30-day retention for all streams** — no per-stream differentiation needed at this stage.
- **Fix AuditLogger backend** — emit pure JSON with `event_type` field; do not add Vector workarounds to mask a backend defect.
- **Data streams not pre-created** — ES creates backing indices automatically on first Vector write.

---

## Section 1: Backend Fix

**File:** `app/guardrails/audit/logger.py`

Two changes to `AuditLogger.log()`:

1. Add `"event_type": "audit_event"` to the emitted JSON payload. This field is the routing discriminator in Vector (`exists(.event_type)`).
2. Change the log call from:
   ```python
   _app_logger.info("audit_event %s", json.dumps(event))
   ```
   to:
   ```python
   _app_logger.info(json.dumps(event))
   ```
   Pure JSON emission, consistent with `span_context` in `app/core/telemetry.py`.

Existing payload fields are unchanged.

---

## Section 2: Vector Config

**File:** `deployments/vector/vector.yaml`

Replace the single `elasticsearch` sink with a `route` transform + 3 data stream sinks. The `parse_json_logs` transform is unchanged.

### Route transform

```
parse_json_logs
    └── route_by_category
            ├── audit  → logs-voice_agent.audit-default
            ├── span   → logs-voice_agent.spans-default
            └── plain  → logs-voice_agent.plain-default
```

VRL conditions:

| Route | Condition |
|---|---|
| `audit` | `exists(.event_type)` |
| `span` | `.log_type == "span" && !exists(.event_type)` |
| `plain` | `.log_type == "plain"` |

### Sinks

Each sink uses `mode: data_stream` on the Vector Elasticsearch sink (sets `op_type: create` and correct `_index` header for data stream writes). Fields `file`, `host`, `source_type` are stripped in all three.

---

## Section 3: Elasticsearch Init Container

**New service:** `elasticsearch-init` in `docker-compose.yaml`

- Image: `curlimages/curl:8`
- `depends_on: elasticsearch: condition: service_healthy`
- `restart: "no"`
- Executes 3 sequential `curl -f -X PUT` calls (exits non-zero on failure):

| # | Endpoint | Object |
|---|---|---|
| 1 | `/_ilm/policy/voice-agent-logs-policy` | Hot rollover at 10 GB / 7 days; delete at 30 days |
| 2 | `/_component_template/voice-agent-logs-mappings` | `dynamic: false`; explicit mappings for all known fields |
| 3 | `/_index_template/voice-agent-logs` | Matches `logs-voice_agent.*-*`; wires component template + ILM; priority 200 |

### ILM Policy

```json
{
  "policy": {
    "phases": {
      "hot": { "actions": { "rollover": { "max_primary_shard_size": "10gb", "max_age": "7d" } } },
      "delete": { "min_age": "30d", "actions": { "delete": {} } }
    }
  }
}
```

### Component Template Mappings

```json
{
  "template": {
    "mappings": {
      "dynamic": "false",
      "properties": {
        "@timestamp":  { "type": "date" },
        "log_type":    { "type": "keyword" },
        "trace_id":    { "type": "keyword" },
        "session_id":  { "type": "keyword" },
        "user_id":     { "type": "keyword" },
        "span_name":   { "type": "keyword" },
        "span_kind":   { "type": "keyword" },
        "duration_ms": { "type": "float" },
        "status":      { "type": "keyword" },
        "event_type":  { "type": "keyword" },
        "raw_message": { "type": "text" },
        "source_file": { "type": "keyword" },
        "environment": { "type": "keyword" },
        "model":       { "type": "keyword" },
        "prompt_tokens":      { "type": "integer" },
        "completion_tokens":  { "type": "integer" },
        "total_tokens":       { "type": "integer" },
        "estimated_cost_usd": { "type": "float" }
      }
    }
  }
}
```

### Index Template

```json
{
  "index_patterns": ["logs-voice_agent.*-*"],
  "data_stream": {},
  "composed_of": ["voice-agent-logs-mappings"],
  "template": {
    "settings": {
      "index.lifecycle.name": "voice-agent-logs-policy",
      "number_of_shards": 1,
      "number_of_replicas": 0
    }
  },
  "priority": 200
}
```

---

## Section 4: Kibana Init Container

**New service:** `kibana-init` in `docker-compose.yaml`

- Image: `curlimages/curl:8`
- `depends_on: kibana: condition: service_healthy`
- `restart: "no"`
- Executes 3 `curl -X POST` calls to Kibana's Saved Objects API with header `kbn-xsrf: true`

**Kibana healthcheck** (added to existing `kibana` service):
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -s http://localhost:5601/api/status | grep -q '\"overall\":{\"level\":\"available\"'"]
  interval: 15s
  timeout: 10s
  retries: 10
  start_period: 60s
```

### Data Views Registered

| Title | Index pattern | Time field |
|---|---|---|
| `Voice Agent — Spans` | `logs-voice_agent.spans-*` | `@timestamp` |
| `Voice Agent — Audit` | `logs-voice_agent.audit-*` | `@timestamp` |
| `Voice Agent — Plain` | `logs-voice_agent.plain-*` | `@timestamp` |

---

## Files Changed

| File | Change |
|---|---|
| `app/guardrails/audit/logger.py` | Pure JSON emission + `event_type` field |
| `deployments/vector/vector.yaml` | Route transform + 3 data stream sinks |
| `docker-compose.yaml` | Kibana healthcheck + `elasticsearch-init` + `kibana-init` services |

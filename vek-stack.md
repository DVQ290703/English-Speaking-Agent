# Role

You are a senior AIOps / Observability Engineer.

I am building a production-grade logs monitoring stack using:

- Vector as the log collector / processor
- Elasticsearch as the log storage backend
- Kibana as the visualization and investigation UI

Your task is to implement a clean, scalable logs indexing architecture using Elasticsearch data streams, not manually managed daily indices.

# Main Goal

Implement a log monitoring setup where logs are routed into logical Elasticsearch data streams based on log category and environment.

---

# Current State

## Infrastructure

All three services run as Docker containers defined in `docker-compose.yaml`:

| Service | Image | Port |
|---|---|---|
| Elasticsearch | `docker.elastic.co/elasticsearch/elasticsearch:8.13.0` | 9200 |
| Kibana | `docker.elastic.co/kibana/kibana:8.13.0` | 5601 |
| Vector | `timberio/vector:0.38.0-alpine` | — |

Security is disabled (`xpack.security.enabled=false`). Single-node cluster. JVM heap capped at 512 MB.

## Log Pipeline (as-is)

Vector config lives at `deployments/vector/vector.yaml`.

**Source:** tails all files under `/logs/*.log` (bind-mounted from `./logs` on the host).

**Transform:** a single `remap` step that:
1. Strips the logger prefix (`YYYY-MM-DD HH:MM:SS LEVEL [AI-Lab-Agent]:`) via regex.
2. Tries `parse_json` on the remaining payload.
3. If JSON and an object → promotes all fields to top-level, sets `.log_type = "span"`.
4. Otherwise → keeps raw text, sets `.log_type = "plain"`.
5. Copies `.file` to `.source_file`.

**Sink:** bulk-indexes every event into `voice-agent-logs-%Y.%m.%d` — a manually managed daily index pattern.

## Log Schema

Two event shapes arrive from the backend:

### Span / trace event (`log_type = "span"`)
Emitted by instrumented routes and middleware. Key fields:

| Field | Type | Description |
|---|---|---|
| `trace_id` | keyword | Distributed trace identifier |
| `session_id` | keyword | Conversation / session identifier |
| `span_name` | keyword | Name of the operation (e.g. `chat_route`, `input_guardrails`) |
| `duration_ms` | float | Wall-clock duration in milliseconds |
| `status` | keyword | `ok` or `error` |
| `log_type` | keyword | Always `span` for these events |
| `timestamp` | date | ISO-8601 event time |

### Audit event (`log_type = "span"` with `event_type` field)
Emitted by the audit logger. Same envelope as spans, plus:

| Field | Type | Description |
|---|---|---|
| `event_type` | keyword | e.g. `input_guardrail`, `output_guardrail`, `llm_call` |
| `session_id` | keyword | Matches the conversation |
| `trace_id` | keyword | Matches the active trace |

### Plain log line (`log_type = "plain"`)
Unstructured log lines that failed JSON parsing. Stored as-is in `raw_message`.

---

# Target Architecture

## Why Data Streams

The current `voice-agent-logs-%Y.%m.%d` index pattern:
- Requires manual rollover or ILM attached to an alias.
- Mixes all log categories into one index, making access control and retention harder.
- No built-in backing-index management.

Elasticsearch **data streams** fix this:
- Write target is a logical name; backing indices are managed automatically.
- ILM rollover is native.
- Each stream can have its own retention and mapping.

## Data Stream Naming Convention

Pattern: `logs-<dataset>-<environment>`

This follows the Elastic Common Schema (ECS) convention and is required for the built-in `logs-*-*` index template to match.

| Stream name | Contents |
|---|---|
| `logs-voice_agent.spans-default` | Trace spans from instrumented routes |
| `logs-voice_agent.audit-default` | Audit events (guardrails, LLM calls) |
| `logs-voice_agent.plain-default` | Unstructured / plain text log lines |

`default` is the environment name. Swap for `prod`, `staging`, etc. when those environments exist.

## Routing Logic in Vector

Vector must inspect `.log_type` and `.event_type` after the parse transform, then route events to the correct data stream:

```
parse_json_logs
    └── route_by_category
            ├── audit  → logs-voice_agent.audit-default
            ├── span   → logs-voice_agent.spans-default
            └── plain  → logs-voice_agent.plain-default
```

The `route` transform uses VRL conditions:

- **audit**: `exists(.event_type)`
- **span**: `.log_type == "span" && !exists(.event_type)`
- **plain**: `.log_type == "plain"`

## Elasticsearch Setup

### ILM Policy: `voice-agent-logs-policy`

```json
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_primary_shard_size": "10gb",
            "max_age": "7d"
          }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": { "delete": {} }
      }
    }
  }
}
```

Adjust `min_age` per stream if audit logs need longer retention.

### Component Template: `voice-agent-logs-mappings`

Defines shared mappings applied to all three streams:

```json
{
  "template": {
    "mappings": {
      "dynamic": "false",
      "properties": {
        "@timestamp":   { "type": "date" },
        "log_type":     { "type": "keyword" },
        "trace_id":     { "type": "keyword" },
        "session_id":   { "type": "keyword" },
        "span_name":    { "type": "keyword" },
        "duration_ms":  { "type": "float" },
        "status":       { "type": "keyword" },
        "event_type":   { "type": "keyword" },
        "raw_message":  { "type": "text" },
        "source_file":  { "type": "keyword" }
      }
    }
  }
}
```

`dynamic: false` prevents uncontrolled field explosion from arbitrary JSON payloads.

### Index Template: `voice-agent-logs`

Matches all three streams via `logs-voice_agent.*-*` and wires up the component template and ILM policy:

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

Priority 200 ensures this template wins over the built-in `logs-*-*` template (priority 100).

## Kibana Data Views

Create one data view per stream for focused investigation:

| Data view name | Index pattern |
|---|---|
| Voice Agent — Spans | `logs-voice_agent.spans-*` |
| Voice Agent — Audit | `logs-voice_agent.audit-*` |
| Voice Agent — Plain | `logs-voice_agent.plain-*` |

Or a single catch-all view `logs-voice_agent.*-*` for cross-stream queries.

---

# Implementation Plan

1. **Apply Elasticsearch objects** — PUT the ILM policy, component template, and index template via the ES REST API (can use Kibana Dev Tools or a one-shot `curl` script run at startup).
2. **Update Vector config** — replace the single `elasticsearch` sink with a `route` transform + three sinks, each targeting the correct data stream name using `mode: data_stream` in the Vector Elasticsearch sink.
3. **Verify routing** — tail `docker compose logs vector`, then query `GET /logs-voice_agent.*-*/_search` in Kibana Dev Tools to confirm events land in the right streams.
4. **Create Kibana data views** — register the three data views via Kibana's Saved Objects API or the UI.
5. **Build dashboards** — latency histogram by `span_name`, error rate by `status`, audit event timeline by `event_type`.

---

# Open Questions

- Should audit logs have a longer retention than span logs (e.g., 90 days for compliance)?
- Do we need per-environment streams now (`-prod`, `-staging`) or is `-default` sufficient?
- Should `dynamic: false` be relaxed for audit events where the payload schema may evolve?

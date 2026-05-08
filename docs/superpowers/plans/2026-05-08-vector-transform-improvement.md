# Vector Transform Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `parse_json_logs` remap transform with a two-pass pipeline (`extract_prefix` → `parse_payload`) that sets `@timestamp` from log content, extracts `level`/`logger` from every log line, and uses error-handled merging; also persist Vector's state directory to prevent duplicate indexing on restart.

**Architecture:** Two chained `remap` transforms — `extract_prefix` strips the log line prefix into structured metadata fields; `parse_payload` classifies and promotes the payload as span or plain. A named Docker volume persists Vector's checkpoint state across container restarts.

**Tech Stack:** Vector 0.38.0 (VRL), Docker Compose, YAML

---

## File Map

| File | Change |
|------|--------|
| `docker-compose.yaml` | Add `VECTOR_DATA_DIR` env var, `vector_data` volume mount on `vector` service, `vector_data` volume declaration |
| `deployments/vector/vector.yaml` | Replace `parse_json_logs` with `extract_prefix` + `parse_payload`; add `tests:` section; update `route_by_category` input to `parse_payload` |

---

### Task 1: Persist Vector state directory in docker-compose.yaml

**Files:**
- Modify: `docker-compose.yaml`

- [ ] **Step 1: Add the environment variable and volume mount to the `vector` service**

Open `docker-compose.yaml`. Find the `vector:` service block (currently lines 185–195). Replace it with:

```yaml
  vector:
    image: timberio/vector:0.38.0-alpine
    container_name: voice_agent_vector
    restart: unless-stopped
    depends_on:
      elasticsearch:
        condition: service_healthy
    environment:
      - VECTOR_DATA_DIR=/var/lib/vector
    volumes:
      - ./logs:/logs:ro
      - ./deployments/vector/vector.yaml:/etc/vector/vector.yaml:ro
      - vector_data:/var/lib/vector
    command: ["--config", "/etc/vector/vector.yaml"]
```

- [ ] **Step 2: Add `vector_data` to the top-level `volumes` block**

Find the `volumes:` block at the end of `docker-compose.yaml` (currently lists `postgres_data`, `pgadmin_data`, `minio_data`, `elasticsearch_data`). Add `vector_data:`:

```yaml
volumes:
  postgres_data:
  pgadmin_data:
  minio_data:
  elasticsearch_data:
  vector_data:
```

- [ ] **Step 3: Verify the compose file is valid**

```bash
docker compose config --quiet
```

Expected: no output (exit code 0). Any YAML error will print a message.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yaml
git commit -m "feat(infra): persist vector state dir to prevent duplicate indexing on restart"
```

---

### Task 2: Write Vector unit tests (TDD — write before implementing)

**Files:**
- Modify: `deployments/vector/vector.yaml` — append a `tests:` section

- [ ] **Step 1: Append the `tests:` block to `deployments/vector/vector.yaml`**

Add the following at the end of the file. These tests reference `extract_prefix` and `parse_payload` which do not exist yet — they will fail validation until Tasks 3 and 4 are complete. That is intentional.

```yaml
tests:
  - name: "span log line — prefix metadata extracted and @timestamp set from JSON payload"
    inputs:
      - insert_at: extract_prefix
        type: log
        log_fields:
          message: "2026-05-07 15:53:11 INFO     [AI-Lab-Agent]: {\"span_name\": \"chat_route\", \"timestamp\": \"2026-05-07T15:53:11.100Z\", \"trace_id\": \"abc123\", \"duration_ms\": 42.0, \"status\": \"ok\"}"
          file: "/logs/2026-05-07.log"
    outputs:
      - extract_output: parse_payload
        conditions:
          - type: vrl
            source: |
              .log_type == "span" &&
              .level == "INFO" &&
              .logger == "AI-Lab-Agent" &&
              .span_name == "chat_route" &&
              .trace_id == "abc123" &&
              !exists(.timestamp) &&
              !exists(.payload)

  - name: "audit log line — event_type promoted to root"
    inputs:
      - insert_at: extract_prefix
        type: log
        log_fields:
          message: "2026-05-07 15:53:11 INFO     [AI-Lab-Agent]: {\"event_type\": \"audit_event\", \"timestamp\": \"2026-05-07T15:53:11.109Z\", \"session_id\": \"sess1\"}"
          file: "/logs/2026-05-07.log"
    outputs:
      - extract_output: parse_payload
        conditions:
          - type: vrl
            source: |
              .log_type == "span" &&
              exists(.event_type) &&
              .event_type == "audit_event" &&
              .session_id == "sess1" &&
              !exists(.timestamp) &&
              !exists(.payload)

  - name: "plain log line — raw_message and level preserved"
    inputs:
      - insert_at: extract_prefix
        type: log
        log_fields:
          message: "2026-05-07 15:53:11 WARNING  [AI-Lab-Agent]: something went wrong"
          file: "/logs/2026-05-07.log"
    outputs:
      - extract_output: parse_payload
        conditions:
          - type: vrl
            source: |
              .log_type == "plain" &&
              .level == "WARNING" &&
              .logger == "AI-Lab-Agent" &&
              .raw_message == "something went wrong" &&
              !exists(.payload)

  - name: "malformed log line — falls back to plain with full message as raw_message"
    inputs:
      - insert_at: extract_prefix
        type: log
        log_fields:
          message: "this does not match the expected prefix format"
          file: "/logs/2026-05-07.log"
    outputs:
      - extract_output: parse_payload
        conditions:
          - type: vrl
            source: |
              .log_type == "plain" &&
              .raw_message == "this does not match the expected prefix format" &&
              !exists(.payload)
```

- [ ] **Step 2: Confirm tests fail before implementation**

```bash
docker compose run --rm --no-deps vector vector test --config /etc/vector/vector.yaml
```

Expected: error about unknown transforms `extract_prefix` and/or `parse_payload`. This confirms the tests are wired correctly and are not vacuously passing.

---

### Task 3: Implement `extract_prefix` transform

**Files:**
- Modify: `deployments/vector/vector.yaml`

- [ ] **Step 1: Replace the `parse_json_logs` transform with `extract_prefix`**

In `deployments/vector/vector.yaml`, find the `transforms:` block. Remove the entire `parse_json_logs:` entry and replace it with `extract_prefix:`:

```yaml
transforms:
  extract_prefix:
    type: remap
    inputs:
      - app_logs
    source: |
      parsed, err = parse_regex(.message, r'^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (?P<level>\S+)\s+\[(?P<logger>[^\]]+)\]:\s+(?P<payload>.+)$')
      if err == null {
        ts, ts_err = parse_timestamp(parsed.ts, "%Y-%m-%d %H:%M:%S")
        if ts_err == null {
          .@timestamp = ts
        }
        .level = parsed.level
        .logger = parsed.logger
        .payload = parsed.payload
      } else {
        .payload = .message
      }
```

Do not add `parse_payload` yet — keep `route_by_category` referencing whatever it currently references. The goal of this step is to get `extract_prefix` into the file cleanly.

- [ ] **Step 2: Validate config syntax (will fail on missing `parse_payload` — that is expected)**

```bash
docker compose run --rm --no-deps vector vector validate --config /etc/vector/vector.yaml
```

Expected: validation error about `route_by_category` referencing the old `parse_json_logs` (not a VRL error). This is expected at this step.

---

### Task 4: Implement `parse_payload` transform and wire up routing

**Files:**
- Modify: `deployments/vector/vector.yaml`

- [ ] **Step 1: Add the `parse_payload` transform after `extract_prefix`**

In the `transforms:` block, add `parse_payload:` immediately after `extract_prefix:`:

```yaml
  parse_payload:
    type: remap
    inputs:
      - extract_prefix
    source: |
      json_payload, json_err = parse_json(.payload)
      if json_err == null && is_object(json_payload) {
        merged, merge_err = merge(., json_payload)
        if merge_err == null {
          . = merged
        } else {
          .parse_error = true
        }
        .log_type = "span"
        if exists(.timestamp) {
          ts, ts_err = to_timestamp(.timestamp)
          if ts_err == null {
            .@timestamp = ts
          }
          del(.timestamp)
        }
      } else {
        .raw_message = .payload
        .log_type = "plain"
      }
      del(.payload)
      .source_file = .file
```

- [ ] **Step 2: Update `route_by_category` to consume `parse_payload`**

Find the `route_by_category:` transform. Change its `inputs` from `parse_json_logs` to `parse_payload`:

```yaml
  route_by_category:
    type: route
    inputs:
      - parse_payload
    route:
      audit: exists(.event_type)
      span: .log_type == "span" && !exists(.event_type)
      plain: .log_type == "plain"
```

- [ ] **Step 3: Validate the complete config**

```bash
docker compose run --rm --no-deps vector vector validate --config /etc/vector/vector.yaml
```

Expected output (last line):
```
√ Config loaded successfully.
```

If there are errors, read the VRL error message — it will point to the exact line.

- [ ] **Step 4: Run unit tests**

```bash
docker compose run --rm --no-deps vector vector test --config /etc/vector/vector.yaml
```

Expected output:
```
Running 4 tests
test span log line — prefix metadata extracted and @timestamp set from JSON payload ... passed
test audit log line — event_type promoted to root ... passed
test plain log line — raw_message and level preserved ... passed
test malformed log line — falls back to plain with full message as raw_message ... passed
4 tests passed
```

If any test fails, the output shows which condition evaluated to false. Check the VRL condition in `tests:` against the transform logic.

- [ ] **Step 5: Commit**

```bash
git add deployments/vector/vector.yaml
git commit -m "feat(vector): two-pass transform — extract_prefix + parse_payload with correct @timestamp and level"
```

---

### Task 5: Smoke-test end-to-end with live stack

**Files:** none — verification only

- [ ] **Step 1: Bring up the stack**

```bash
docker compose up -d elasticsearch kibana vector elasticsearch-init kibana-init
```

- [ ] **Step 2: Watch Vector logs for errors**

```bash
docker compose logs -f vector
```

Expected: lines like `Finished sending events to the Elasticsearch endpoint` with no `ERROR` entries. Press Ctrl+C after ~30 seconds.

- [ ] **Step 3: Query Elasticsearch to confirm events land in the right streams**

```bash
curl -s "http://localhost:9200/logs-voice_agent.*-*/_search?size=3&sort=@timestamp:desc" \
  | python -m json.tool | head -60
```

Expected: hits with `_index` values like `.ds-logs-voice_agent.spans-default-*`. Confirm `@timestamp` values match the timestamps inside the log lines (not today's date if the logs are historical).

- [ ] **Step 4: Confirm `level` field is present in Kibana**

Open Kibana at `http://localhost:5601`. Go to **Discover → Voice Agent - Plain**. In the field list, confirm `level` appears and has values like `INFO`, `WARNING`, `ERROR`.

- [ ] **Step 5: Confirm Vector state dir is persisted**

```bash
docker compose restart vector
docker compose logs vector | grep "Finished sending"
```

Expected: Vector resumes from its checkpoint — it should NOT re-send events already indexed. The event count in Elasticsearch should not increase after the restart.

```bash
curl -s "http://localhost:9200/logs-voice_agent.*-*/_count" | python -m json.tool
```

Restart Vector again, wait 15 seconds, run the count again. The number should be identical.

# Prometheus + Grafana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Prometheus + Grafana observability stack with LLM streaming (TTFT metric) for both Docker Compose and Kubernetes.

**Architecture:** Use sync `.stream()` from `langchain_groq.ChatGroq` to measure TTFT on the first chunk — no async propagation, no changes to `pipeline.py`, `ai_services.py`, or `chat.py`. Prometheus scrapes the existing `/metrics` endpoint. Grafana dashboards are provisioned via config files (Docker Compose mounts directory; K8s embeds in ConfigMaps).

**Tech Stack:** `prometheus_client`, `prometheus-fastapi-instrumentator`, `prom/prometheus:v2.52.0`, `grafana/grafana:10.4.0`, `langchain_groq.ChatGroq.stream()`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `app/core/metrics.py` | Add `llm_ttft_seconds` histogram; update `record_span_metrics` |
| Modify | `app/services/groq_llm.py` | Replace `invoke()` with `stream()` loop; record TTFT |
| Create | `tests/test_core/test_metrics_ttft.py` | Unit tests for TTFT metric recording |
| Create | `tests/test_services/test_groq_llm_streaming.py` | Unit tests for streaming + TTFT in LLM service |
| Modify | `docker-compose.yaml` | Add `prometheus` + `grafana` services and volumes |
| Create | `deployments/prometheus/prometheus.yml` | Prometheus scrape config |
| Create | `deployments/grafana/provisioning/datasources/prometheus.yml` | Grafana datasource config |
| Create | `deployments/grafana/provisioning/dashboards/dashboards.yml` | Grafana dashboard provider config |
| Create | `deployments/grafana/provisioning/dashboards/voice-agent-pipeline.json` | Dashboard JSON (14 panels, 4 rows) |
| Create | `deployments/prometheus/deploy.yaml` | K8s: ConfigMap + Deployment + Service for Prometheus |
| Create | `deployments/grafana/deploy.yaml` | K8s: 3x ConfigMap + Deployment + Service for Grafana |

---

## Task 1: Add `llm_ttft_seconds` Histogram to Metrics

**Files:**
- Modify: `app/core/metrics.py`
- Create: `tests/test_core/test_metrics_ttft.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_core/test_metrics_ttft.py`:

```python
"""Tests for TTFT metric recording in record_span_metrics."""
import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")


class TestRecordSpanMetricsTTFT:
    def test_llm_span_with_ttft_observes_histogram(self):
        from unittest.mock import patch, MagicMock
        from app.core.metrics import record_span_metrics

        mock_labels = MagicMock()
        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            mock_hist.labels.return_value = mock_labels
            record_span_metrics(
                "llm.generate_response", "llm", 1500, "ok",
                {"model": "llama-3.3-70b-versatile", "ttft_ms": 250.0},
            )

        mock_hist.labels.assert_called_once_with(
            model="llama-3.3-70b-versatile", endpoint="llm.generate_response"
        )
        mock_labels.observe.assert_called_once_with(0.25)  # 250ms → 0.25s

    def test_llm_span_without_ttft_does_not_observe_histogram(self):
        from unittest.mock import patch
        from app.core.metrics import record_span_metrics

        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            record_span_metrics(
                "llm.generate_response", "llm", 1500, "ok",
                {"model": "llama-3.3-70b-versatile"},
            )

        mock_hist.labels.return_value.observe.assert_not_called()

    def test_llm_span_ttft_none_does_not_observe_histogram(self):
        from unittest.mock import patch
        from app.core.metrics import record_span_metrics

        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            record_span_metrics(
                "llm.generate_response", "llm", 1500, "ok",
                {"model": "test-model", "ttft_ms": None},
            )

        mock_hist.labels.return_value.observe.assert_not_called()

    def test_non_llm_span_does_not_touch_ttft_histogram(self):
        from unittest.mock import patch
        from app.core.metrics import record_span_metrics

        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            record_span_metrics(
                "stt.transcribe", "stt", 800, "ok",
                {"model": "whisper-large-v3-turbo", "ttft_ms": 100.0},
            )

        mock_hist.labels.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_core/test_metrics_ttft.py -v
```

Expected: `ImportError` or `AttributeError: module 'app.core.metrics' has no attribute 'llm_ttft_seconds'`

- [ ] **Step 3: Add histogram and update `record_span_metrics` in `app/core/metrics.py`**

After the existing `guardrail_decisions_total` counter (line 76), add before the placeholder metrics block:

```python
# ---------------------------------------------------------------------------
# TTFT metric
# ---------------------------------------------------------------------------

llm_ttft_seconds = Histogram(
    "llm_ttft_seconds",
    "LLM time-to-first-token latency in seconds",
    ["model", "endpoint"],
    buckets=[0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0, 5.0],
)
```

Then in `record_span_metrics`, inside the `if kind == "llm":` block, after the existing cost recording (after the `if cost:` block), add:

```python
        ttft_ms = extra.get("ttft_ms")
        if ttft_ms is not None:
            llm_ttft_seconds.labels(model=model, endpoint=name).observe(ttft_ms / 1000.0)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_core/test_metrics_ttft.py -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Run full test suite to check no regressions**

```bash
python -m pytest tests/ -v --tb=short
```

Expected: all previously passing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add app/core/metrics.py tests/test_core/test_metrics_ttft.py
git commit -m "feat(metrics): add llm_ttft_seconds histogram and TTFT recording"
```

---

## Task 2: LLM Streaming with TTFT Recording

**Files:**
- Modify: `app/services/groq_llm.py`
- Create: `tests/test_services/test_groq_llm_streaming.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_services/test_groq_llm_streaming.py`:

```python
"""Tests for streaming refactor and TTFT recording in GroqLLMService."""
import os
import json
from unittest.mock import MagicMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")


def _make_service():
    """Build a GroqLLMService with a mocked ChatGroq client."""
    from app.services.groq_llm import GroqLLMService
    service = GroqLLMService.__new__(GroqLLMService)
    service.model_name = "test-model"
    service.client = MagicMock()
    return service


def _make_chunk(content, usage=None):
    chunk = MagicMock()
    chunk.content = content
    chunk.usage_metadata = usage or {}
    return chunk


class TestGenerateResponseStreaming:
    def test_uses_stream_not_invoke(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("Hello"),
            _make_chunk(" world", {"input_tokens": 5, "output_tokens": 3, "total_tokens": 8}),
        ])

        result = service.generate_response("Hi")

        assert result == "Hello world"
        service.client.stream.assert_called_once()
        service.client.invoke.assert_not_called()

    def test_concatenates_all_chunks(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("One"),
            _make_chunk(" two"),
            _make_chunk(" three"),
        ])

        result = service.generate_response("count")

        assert result == "One two three"

    def test_records_ttft_in_span_extra(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("Hi"),
            _make_chunk("!", {"input_tokens": 2, "output_tokens": 1, "total_tokens": 3}),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response("hello")

        assert mock_record.called
        extra = mock_record.call_args[0][4]
        assert "ttft_ms" in extra
        assert extra["ttft_ms"] > 0

    def test_ttft_is_none_if_all_chunks_empty(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk(""),
            _make_chunk("", {"input_tokens": 1, "output_tokens": 0, "total_tokens": 1}),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response("hello")

        extra = mock_record.call_args[0][4]
        assert extra.get("ttft_ms") is None

    def test_token_counts_read_from_last_chunk(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("Hello"),
            _make_chunk(" world", {"input_tokens": 10, "output_tokens": 7, "total_tokens": 17}),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response("hi")

        extra = mock_record.call_args[0][4]
        assert extra.get("prompt_tokens") == 10
        assert extra.get("completion_tokens") == 7


class TestGenerateResponseWithGrammarStreaming:
    def test_uses_stream_not_invoke(self):
        service = _make_service()
        json_response = json.dumps({"response_text": "Nice job!", "grammar": {}})
        service.client.bind.return_value.stream.return_value = iter([
            _make_chunk(json_response),
        ])

        result_text, raw = service.generate_response_with_grammar("How are you?")

        assert result_text == "Nice job!"
        service.client.bind.return_value.stream.assert_called_once()
        service.client.bind.return_value.invoke.assert_not_called()

    def test_records_ttft_in_span_extra(self):
        service = _make_service()
        json_response = json.dumps({"response_text": "Good!"})
        service.client.bind.return_value.stream.return_value = iter([
            _make_chunk(json_response),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response_with_grammar("test")

        extra = mock_record.call_args[0][4]
        assert "ttft_ms" in extra
        assert extra["ttft_ms"] > 0

    def test_falls_back_to_plain_on_invalid_json(self):
        service = _make_service()
        # Grammar call returns broken JSON
        service.client.bind.return_value.stream.return_value = iter([
            _make_chunk("{broken json"),
        ])
        # Fallback generate_response uses stream too
        service.client.stream.return_value = iter([
            _make_chunk("Fallback response"),
        ])

        result_text, raw = service.generate_response_with_grammar("test")

        assert result_text == "Fallback response"
        assert raw is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_services/test_groq_llm_streaming.py -v
```

Expected: tests fail because `generate_response` still uses `invoke()` not `stream()`

- [ ] **Step 3: Refactor `generate_response` in `app/services/groq_llm.py`**

Replace the `with span_context(...)` block inside `generate_response` (lines 78–91) with:

```python
        with span_context("llm.generate_response", kind="llm") as span:
            result = ""
            ttft_ms = None
            t0 = time.perf_counter()
            final_chunk = None
            for chunk in self.client.stream(messages):
                if ttft_ms is None and chunk.content:
                    ttft_ms = (time.perf_counter() - t0) * 1000
                result += chunk.content
                final_chunk = chunk

            usage = {}
            if final_chunk is not None:
                usage = getattr(final_chunk, "usage_metadata", {}) or {}

            span.set(
                model=self.model_name,
                prompt_tokens=usage.get("input_tokens", 0),
                completion_tokens=usage.get("output_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                ttft_ms=ttft_ms,
            )
```

Also add `import time` at the top of the file if not present. Then change the return to `return result`.

- [ ] **Step 4: Refactor `generate_response_with_grammar` in `app/services/groq_llm.py`**

Replace the `with span_context(...)` block inside `generate_response_with_grammar` (lines 128–139) with:

```python
            with span_context("llm.generate_response_with_grammar", kind="llm") as span:
                json_client = self.client.bind(response_format={"type": "json_object"})
                raw = ""
                ttft_ms = None
                t0 = time.perf_counter()
                final_chunk = None
                for chunk in json_client.stream(messages):
                    if ttft_ms is None and chunk.content:
                        ttft_ms = (time.perf_counter() - t0) * 1000
                    raw += chunk.content
                    final_chunk = chunk

                usage = {}
                if final_chunk is not None:
                    usage = getattr(final_chunk, "usage_metadata", {}) or {}

                span.set(
                    model=self.model_name,
                    prompt_tokens=usage.get("input_tokens", 0),
                    completion_tokens=usage.get("output_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                    ttft_ms=ttft_ms,
                )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m pytest tests/test_services/test_groq_llm_streaming.py -v
```

Expected: all 8 tests PASS

- [ ] **Step 6: Run full test suite**

```bash
python -m pytest tests/ -v --tb=short
```

Expected: all previously passing tests still PASS

- [ ] **Step 7: Commit**

```bash
git add app/services/groq_llm.py tests/test_services/test_groq_llm_streaming.py
git commit -m "feat(llm): switch to sync streaming for TTFT measurement"
```

---

## Task 3: Docker Compose — Prometheus + Grafana

**Files:**
- Create: `deployments/prometheus/prometheus.yml`
- Create: `deployments/grafana/provisioning/datasources/prometheus.yml`
- Create: `deployments/grafana/provisioning/dashboards/dashboards.yml`
- Create: `deployments/grafana/provisioning/dashboards/voice-agent-pipeline.json`
- Modify: `docker-compose.yaml`

- [ ] **Step 1: Create Prometheus scrape config**

Create `deployments/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: voice_agent_backend
    static_configs:
      - targets: ["backend:8000"]
    metrics_path: /metrics
```

- [ ] **Step 2: Create Grafana datasource config**

Create `deployments/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: "15s"
```

- [ ] **Step 3: Create Grafana dashboard provider config**

Create `deployments/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1
providers:
  - name: default
    orgId: 1
    folder: ""
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
```

- [ ] **Step 4: Create Grafana dashboard JSON**

Create `deployments/grafana/provisioning/dashboards/voice-agent-pipeline.json`:

```json
{
  "annotations": {"list": []},
  "description": "Voice Agent pipeline: LLM, STT, TTS, guardrail metrics",
  "editable": true,
  "graphTooltip": 1,
  "links": [],
  "panels": [
    {
      "collapsed": false,
      "gridPos": {"h": 1, "w": 24, "x": 0, "y": 0},
      "id": 100,
      "title": "LLM",
      "type": "row"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 1},
      "id": 1,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum by (status) (rate(llm_requests_total[5m]))",
          "legendFormat": "{{status}}"
        }
      ],
      "title": "LLM Request Rate",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 1},
      "id": 2,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.50, sum by (le) (rate(llm_latency_seconds_bucket[5m])))",
          "legendFormat": "p50"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.95, sum by (le) (rate(llm_latency_seconds_bucket[5m])))",
          "legendFormat": "p95"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.99, sum by (le) (rate(llm_latency_seconds_bucket[5m])))",
          "legendFormat": "p99"
        }
      ],
      "title": "LLM Latency (p50/p95/p99)",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 1},
      "id": 3,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.50, sum by (le) (rate(llm_ttft_seconds_bucket[5m])))",
          "legendFormat": "p50"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.95, sum by (le) (rate(llm_ttft_seconds_bucket[5m])))",
          "legendFormat": "p95"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.99, sum by (le) (rate(llm_ttft_seconds_bucket[5m])))",
          "legendFormat": "p99"
        }
      ],
      "title": "LLM TTFT (p50/p95/p99)",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "short"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 9},
      "id": 4,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum by (token_type) (rate(llm_tokens_total[5m]))",
          "legendFormat": "{{token_type}}"
        }
      ],
      "title": "Token Burn Rate",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "currencyUSD", "decimals": 4}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 9},
      "id": 5,
      "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "orientation": "auto", "textMode": "auto", "colorMode": "value"},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum(increase(llm_cost_usd_total[1h]))",
          "legendFormat": "Cost/hr"
        }
      ],
      "title": "LLM Cost / hr",
      "type": "stat"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 9},
      "id": 6,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum(rate(llm_requests_total{status=\"error\"}[5m]))",
          "legendFormat": "error/s"
        }
      ],
      "title": "LLM Error Rate",
      "type": "timeseries"
    },
    {
      "collapsed": false,
      "gridPos": {"h": 1, "w": 24, "x": 0, "y": 17},
      "id": 101,
      "title": "STT",
      "type": "row"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 18},
      "id": 7,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum by (status) (rate(stt_requests_total[5m]))",
          "legendFormat": "{{status}}"
        }
      ],
      "title": "STT Request Rate",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 18},
      "id": 8,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.50, sum by (le) (rate(stt_latency_seconds_bucket[5m])))",
          "legendFormat": "p50"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.95, sum by (le) (rate(stt_latency_seconds_bucket[5m])))",
          "legendFormat": "p95"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.99, sum by (le) (rate(stt_latency_seconds_bucket[5m])))",
          "legendFormat": "p99"
        }
      ],
      "title": "STT Latency (p50/p95/p99)",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 18},
      "id": 9,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum(rate(stt_requests_total{status=\"error\"}[5m]))",
          "legendFormat": "error/s"
        }
      ],
      "title": "STT Error Rate",
      "type": "timeseries"
    },
    {
      "collapsed": false,
      "gridPos": {"h": 1, "w": 24, "x": 0, "y": 26},
      "id": 102,
      "title": "TTS",
      "type": "row"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 27},
      "id": 10,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum by (status) (rate(tts_requests_total[5m]))",
          "legendFormat": "{{status}}"
        }
      ],
      "title": "TTS Request Rate",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 27},
      "id": 11,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.50, sum by (le) (rate(tts_latency_seconds_bucket[5m])))",
          "legendFormat": "p50"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.95, sum by (le) (rate(tts_latency_seconds_bucket[5m])))",
          "legendFormat": "p95"
        },
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "histogram_quantile(0.99, sum by (le) (rate(tts_latency_seconds_bucket[5m])))",
          "legendFormat": "p99"
        }
      ],
      "title": "TTS Latency (p50/p95/p99)",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 27},
      "id": 12,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum(rate(tts_requests_total{status=\"error\"}[5m]))",
          "legendFormat": "error/s"
        }
      ],
      "title": "TTS Error Rate",
      "type": "timeseries"
    },
    {
      "collapsed": false,
      "gridPos": {"h": 1, "w": 24, "x": 0, "y": 35},
      "id": 103,
      "title": "Guardrails",
      "type": "row"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 36},
      "id": 13,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum(rate(guardrail_decisions_total{decision=\"blocked\"}[5m]))",
          "legendFormat": "blocked/s"
        }
      ],
      "title": "Guardrail Block Rate",
      "type": "timeseries"
    },
    {
      "datasource": {"type": "prometheus", "uid": "prometheus"},
      "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []},
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 36},
      "id": 14,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "datasource": {"type": "prometheus", "uid": "prometheus"},
          "expr": "sum by (decision) (rate(guardrail_decisions_total[5m]))",
          "legendFormat": "{{decision}}"
        }
      ],
      "title": "Allow vs Block Ratio",
      "type": "timeseries"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "tags": ["voice-agent", "ai"],
  "time": {"from": "now-1h", "to": "now"},
  "timezone": "browser",
  "title": "Voice Agent — Pipeline",
  "uid": "voice-agent-pipeline",
  "version": 1
}
```

- [ ] **Step 5: Add prometheus and grafana services to `docker-compose.yaml`**

Add these two services before the `volumes:` block at the end of `docker-compose.yaml`:

```yaml
  prometheus:
    image: prom/prometheus:v2.52.0
    container_name: voice_agent_prometheus
    restart: unless-stopped
    volumes:
      - ./deployments/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=30d
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:10.4.0
    container_name: voice_agent_grafana
    restart: unless-stopped
    depends_on:
      - prometheus
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./deployments/grafana/provisioning:/etc/grafana/provisioning:ro
    ports:
      - "3001:3000"
```

Add `prometheus_data:` and `grafana_data:` to the `volumes:` block:

```yaml
volumes:
  postgres_data:
  pgadmin_data:
  minio_data:
  elasticsearch_data:
  vector_data:
  prometheus_data:
  grafana_data:
```

- [ ] **Step 6: Smoke test locally**

```bash
docker compose up prometheus grafana -d
```

Wait 15 seconds, then:

```bash
# Verify Prometheus is up
curl -s http://localhost:9090/-/healthy
# Expected: Prometheus Server is Healthy.

# Verify Grafana is up
curl -s http://localhost:3001/api/health
# Expected: {"commit":"...","database":"ok","version":"10.4.0"}
```

Open `http://localhost:3001` in browser, login with `admin`/`admin` (or your `GRAFANA_ADMIN_PASSWORD`).
Navigate to Dashboards → "Voice Agent — Pipeline". Verify 14 panels load (may show "No data" until backend has traffic — that is expected).

- [ ] **Step 7: Commit**

```bash
git add deployments/prometheus/prometheus.yml \
        deployments/grafana/provisioning/datasources/prometheus.yml \
        deployments/grafana/provisioning/dashboards/dashboards.yml \
        deployments/grafana/provisioning/dashboards/voice-agent-pipeline.json \
        docker-compose.yaml
git commit -m "feat(monitoring): add Prometheus + Grafana to Docker Compose"
```

---

## Task 4: Kubernetes — Prometheus Manifests

**Files:**
- Create: `deployments/prometheus/deploy.yaml`

- [ ] **Step 1: Create `deployments/prometheus/deploy.yaml`**

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: english-speaking-agent
  labels:
    app: prometheus
    tier: monitoring
    project: english-speaking-agent
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s

    scrape_configs:
      - job_name: voice_agent_backend
        static_configs:
          - targets: ["backend-agent-service:8000"]
        metrics_path: /metrics
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: english-speaking-agent
  labels:
    app: prometheus
    tier: monitoring
    project: english-speaking-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: prometheus
        tier: monitoring
        project: english-speaking-agent
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: prometheus
          image: prom/prometheus:v2.52.0
          args:
            - --config.file=/etc/prometheus/prometheus.yml
            - --storage.tsdb.retention.time=30d
            - --storage.tsdb.path=/prometheus
          ports:
            - containerPort: 9090
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /-/ready
              port: 9090
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /-/healthy
              port: 9090
            initialDelaySeconds: 20
            periodSeconds: 20
          volumeMounts:
            - name: config
              mountPath: /etc/prometheus
            - name: data
              mountPath: /prometheus
          securityContext:
            allowPrivilegeEscalation: false
      volumes:
        - name: config
          configMap:
            name: prometheus-config
        - name: data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus-service
  namespace: english-speaking-agent
  labels:
    app: prometheus
    tier: monitoring
    project: english-speaking-agent
spec:
  type: ClusterIP
  selector:
    app: prometheus
  ports:
    - port: 9090
      targetPort: 9090
      protocol: TCP
```

- [ ] **Step 2: Apply and verify**

```bash
kubectl apply -f deployments/prometheus/deploy.yaml
kubectl rollout status deployment/prometheus -n english-speaking-agent
```

Expected: `deployment "prometheus" successfully rolled out`

```bash
kubectl port-forward svc/prometheus-service 9090:9090 -n english-speaking-agent &
sleep 3
curl -s http://localhost:9090/-/healthy
# Expected: Prometheus Server is Healthy.

# Check scrape targets
curl -s http://localhost:9090/api/v1/targets | python -m json.tool | grep -A3 '"health"'
# Expected: "health": "up" for voice_agent_backend
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add deployments/prometheus/deploy.yaml
git commit -m "feat(k8s): add Prometheus deployment and service"
```

---

## Task 5: Kubernetes — Grafana Manifests

**Files:**
- Create: `deployments/grafana/deploy.yaml`

- [ ] **Step 1: Create `deployments/grafana/deploy.yaml`**

The dashboard JSON content below is the same JSON from Task 3 Step 4. Embed it in the ConfigMap using a YAML literal block (`|`).

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasource-config
  namespace: english-speaking-agent
  labels:
    app: grafana
    tier: monitoring
    project: english-speaking-agent
data:
  prometheus.yml: |
    apiVersion: 1
    datasources:
      - name: Prometheus
        uid: prometheus
        type: prometheus
        access: proxy
        url: http://prometheus-service:9090
        isDefault: true
        jsonData:
          timeInterval: "15s"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards-provider
  namespace: english-speaking-agent
  labels:
    app: grafana
    tier: monitoring
    project: english-speaking-agent
data:
  dashboards.yml: |
    apiVersion: 1
    providers:
      - name: default
        orgId: 1
        folder: ""
        type: file
        disableDeletion: false
        updateIntervalSeconds: 30
        options:
          path: /var/lib/grafana/dashboards
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-voice-agent
  namespace: english-speaking-agent
  labels:
    app: grafana
    tier: monitoring
    project: english-speaking-agent
data:
  voice-agent-pipeline.json: |
    {
      "annotations": {"list": []},
      "description": "Voice Agent pipeline: LLM, STT, TTS, guardrail metrics",
      "editable": true,
      "graphTooltip": 1,
      "links": [],
      "panels": [
        {"collapsed": false, "gridPos": {"h": 1, "w": 24, "x": 0, "y": 0}, "id": 100, "title": "LLM", "type": "row"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 0, "y": 1}, "id": 1, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum by (status) (rate(llm_requests_total[5m]))", "legendFormat": "{{status}}"}], "title": "LLM Request Rate", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 8, "y": 1}, "id": 2, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.50, sum by (le) (rate(llm_latency_seconds_bucket[5m])))", "legendFormat": "p50"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.95, sum by (le) (rate(llm_latency_seconds_bucket[5m])))", "legendFormat": "p95"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.99, sum by (le) (rate(llm_latency_seconds_bucket[5m])))", "legendFormat": "p99"}], "title": "LLM Latency (p50/p95/p99)", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 16, "y": 1}, "id": 3, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.50, sum by (le) (rate(llm_ttft_seconds_bucket[5m])))", "legendFormat": "p50"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.95, sum by (le) (rate(llm_ttft_seconds_bucket[5m])))", "legendFormat": "p95"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.99, sum by (le) (rate(llm_ttft_seconds_bucket[5m])))", "legendFormat": "p99"}], "title": "LLM TTFT (p50/p95/p99)", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "short"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 0, "y": 9}, "id": 4, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum by (token_type) (rate(llm_tokens_total[5m]))", "legendFormat": "{{token_type}}"}], "title": "Token Burn Rate", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "currencyUSD", "decimals": 4}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 8, "y": 9}, "id": 5, "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "orientation": "auto", "textMode": "auto", "colorMode": "value"}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(increase(llm_cost_usd_total[1h]))", "legendFormat": "Cost/hr"}], "title": "LLM Cost / hr", "type": "stat"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 16, "y": 9}, "id": 6, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(rate(llm_requests_total{status=\"error\"}[5m]))", "legendFormat": "error/s"}], "title": "LLM Error Rate", "type": "timeseries"},
        {"collapsed": false, "gridPos": {"h": 1, "w": 24, "x": 0, "y": 17}, "id": 101, "title": "STT", "type": "row"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 0, "y": 18}, "id": 7, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum by (status) (rate(stt_requests_total[5m]))", "legendFormat": "{{status}}"}], "title": "STT Request Rate", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 8, "y": 18}, "id": 8, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.50, sum by (le) (rate(stt_latency_seconds_bucket[5m])))", "legendFormat": "p50"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.95, sum by (le) (rate(stt_latency_seconds_bucket[5m])))", "legendFormat": "p95"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.99, sum by (le) (rate(stt_latency_seconds_bucket[5m])))", "legendFormat": "p99"}], "title": "STT Latency (p50/p95/p99)", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 16, "y": 18}, "id": 9, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(rate(stt_requests_total{status=\"error\"}[5m]))", "legendFormat": "error/s"}], "title": "STT Error Rate", "type": "timeseries"},
        {"collapsed": false, "gridPos": {"h": 1, "w": 24, "x": 0, "y": 26}, "id": 102, "title": "TTS", "type": "row"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 0, "y": 27}, "id": 10, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum by (status) (rate(tts_requests_total[5m]))", "legendFormat": "{{status}}"}], "title": "TTS Request Rate", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "s"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 8, "y": 27}, "id": 11, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.50, sum by (le) (rate(tts_latency_seconds_bucket[5m])))", "legendFormat": "p50"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.95, sum by (le) (rate(tts_latency_seconds_bucket[5m])))", "legendFormat": "p95"}, {"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "histogram_quantile(0.99, sum by (le) (rate(tts_latency_seconds_bucket[5m])))", "legendFormat": "p99"}], "title": "TTS Latency (p50/p95/p99)", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 8, "x": 16, "y": 27}, "id": 12, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(rate(tts_requests_total{status=\"error\"}[5m]))", "legendFormat": "error/s"}], "title": "TTS Error Rate", "type": "timeseries"},
        {"collapsed": false, "gridPos": {"h": 1, "w": 24, "x": 0, "y": 35}, "id": 103, "title": "Guardrails", "type": "row"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 12, "x": 0, "y": 36}, "id": 13, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum(rate(guardrail_decisions_total{decision=\"blocked\"}[5m]))", "legendFormat": "blocked/s"}], "title": "Guardrail Block Rate", "type": "timeseries"},
        {"datasource": {"type": "prometheus", "uid": "prometheus"}, "fieldConfig": {"defaults": {"unit": "reqps"}, "overrides": []}, "gridPos": {"h": 8, "w": 12, "x": 12, "y": 36}, "id": 14, "options": {"tooltip": {"mode": "multi"}}, "targets": [{"datasource": {"type": "prometheus", "uid": "prometheus"}, "expr": "sum by (decision) (rate(guardrail_decisions_total[5m]))", "legendFormat": "{{decision}}"}], "title": "Allow vs Block Ratio", "type": "timeseries"}
      ],
      "refresh": "30s",
      "schemaVersion": 38,
      "tags": ["voice-agent", "ai"],
      "time": {"from": "now-1h", "to": "now"},
      "timezone": "browser",
      "title": "Voice Agent — Pipeline",
      "uid": "voice-agent-pipeline",
      "version": 1
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: english-speaking-agent
  labels:
    app: grafana
    tier: monitoring
    project: english-speaking-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: grafana
        tier: monitoring
        project: english-speaking-agent
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: grafana
          image: grafana/grafana:10.4.0
          ports:
            - containerPort: 3000
          env:
            - name: GF_SECURITY_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: backend-secret
                  key: GRAFANA_ADMIN_PASSWORD
                  optional: true
            - name: GF_USERS_ALLOW_SIGN_UP
              value: "false"
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 20
          volumeMounts:
            - name: grafana-data
              mountPath: /var/lib/grafana
            - name: datasource-config
              mountPath: /etc/grafana/provisioning/datasources
            - name: dashboards-provider
              mountPath: /etc/grafana/provisioning/dashboards
            - name: dashboard-voice-agent
              mountPath: /var/lib/grafana/dashboards
          securityContext:
            allowPrivilegeEscalation: false
      volumes:
        - name: grafana-data
          emptyDir: {}
        - name: datasource-config
          configMap:
            name: grafana-datasource-config
        - name: dashboards-provider
          configMap:
            name: grafana-dashboards-provider
        - name: dashboard-voice-agent
          configMap:
            name: grafana-dashboard-voice-agent
---
apiVersion: v1
kind: Service
metadata:
  name: grafana-service
  namespace: english-speaking-agent
  labels:
    app: grafana
    tier: monitoring
    project: english-speaking-agent
spec:
  type: ClusterIP
  selector:
    app: grafana
  ports:
    - port: 3000
      targetPort: 3000
      protocol: TCP
```

**Note on the Grafana admin password in K8s:** The deployment reads `GRAFANA_ADMIN_PASSWORD` from `backend-secret` with `optional: true` — if the key doesn't exist in the secret, Grafana falls back to `admin`. To set a real password, add it to the secret:

```bash
kubectl patch secret backend-secret -n english-speaking-agent \
  --type='merge' \
  -p '{"stringData": {"GRAFANA_ADMIN_PASSWORD": "your-secure-password"}}'
```

- [ ] **Step 2: Apply and verify**

```bash
kubectl apply -f deployments/grafana/deploy.yaml
kubectl rollout status deployment/grafana -n english-speaking-agent
```

Expected: `deployment "grafana" successfully rolled out`

```bash
kubectl port-forward svc/grafana-service 3001:3000 -n english-speaking-agent &
sleep 5
curl -s http://localhost:3001/api/health
# Expected: {"commit":"...","database":"ok","version":"10.4.0"}

# Verify dashboard was auto-provisioned
curl -s http://localhost:3001/api/dashboards/uid/voice-agent-pipeline \
  -u admin:admin | python -m json.tool | grep '"title"'
# Expected: "title": "Voice Agent — Pipeline"
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add deployments/grafana/deploy.yaml
git commit -m "feat(k8s): add Grafana deployment, services, and provisioned dashboard"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 8 spec sections covered — streaming refactor (Task 2), TTFT metric (Task 1), Docker Compose (Task 3), K8s Prometheus (Task 4), K8s Grafana (Task 5), dashboard with all 14 panels (Tasks 3+5)
- [x] **No placeholders:** All steps have complete code, exact file paths, exact commands, expected outputs
- [x] **Type consistency:** `ttft_ms` is `float | None` throughout — set in `groq_llm.py`, passed via `span.set()`, read in `record_span_metrics()` via `extra.get("ttft_ms")`
- [x] **Method names consistent:** `llm_ttft_seconds` in metrics.py, `stream()` in groq_llm.py, `prometheus-service:9090` in K8s grafana datasource
- [x] **No async propagation:** `.stream()` (sync) keeps `pipeline.py`, `ai_services.py`, `chat.py` untouched — no test rewrites needed

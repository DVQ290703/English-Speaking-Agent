# Prometheus + Grafana Stack — Design Spec

**Date:** 2026-05-08
**Branch:** logging/mornitoring
**Approach:** B — Prometheus + Grafana + LLM streaming refactor + TTFT metric

---

## 1. Scope

Add a full Prometheus + Grafana observability stack for both local Docker Compose and Kubernetes (GKE). Includes a streaming refactor of the Groq LLM service to enable Time-to-First-Token (TTFT) measurement. No changes to API contracts, database schema, or any other service.

---

## 2. Architecture

```
backend:8000/metrics
       │
       ▼ scrape every 15s
  prometheus:9090  ──────────────────▶  grafana:3000
  (time-series DB, 30d retention)        (dashboards, ConfigMap-provisioned)

Docker Compose: two new services (prometheus, grafana), two new volumes
K8s:            deployments/prometheus/deploy.yaml
                deployments/grafana/deploy.yaml
                Both ClusterIP — accessed via kubectl port-forward
```

---

## 3. Streaming Refactor (`app/services/groq_llm.py`)

**Current:** `self.client.invoke(messages)` — blocking, full response before return.

**Target:** `self.client.astream(messages)` — async generator, yields chunks as they arrive.

**TTFT measurement:**
```python
ttft_ms = None
t0 = time.perf_counter()
async for chunk in self.client.astream(messages):
    if ttft_ms is None:
        ttft_ms = (time.perf_counter() - t0) * 1000
    result += chunk.content
span.set(..., ttft_ms=ttft_ms)
```

**Both methods refactored:** `generate_response()` and `generate_response_with_grammar()` become `async def`.

**JSON mode caveat:** `generate_response_with_grammar` collects all chunks before `json.loads()`. TTFT is still recorded on first chunk. Caller behavior is unchanged.

**Caller impact:** `app/agents/pipeline.py` — two call sites updated to `await`. No other files change.

---

## 4. Metrics (`app/core/metrics.py` + `app/core/telemetry.py`)

**New histogram in `metrics.py`:**
```python
llm_ttft_seconds = Histogram(
    "llm_ttft_seconds",
    "LLM time-to-first-token latency in seconds",
    ["model", "endpoint"],
    buckets=[0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0, 5.0],
)
```

**`record_span_metrics()` update** — in the `kind == "llm"` branch:
```python
ttft_ms = extra.get("ttft_ms")
if ttft_ms is not None:
    llm_ttft_seconds.labels(model=model, endpoint=name).observe(ttft_ms / 1000.0)
```

**`telemetry.py`:** No changes required — `span.set()` already passes `**kwargs` into `extra`.

---

## 5. Docker Compose

**New files:**
- `deployments/prometheus/prometheus.yml` — scrape config, targets `backend:8000/metrics`, 15s interval
- `deployments/grafana/provisioning/datasources/prometheus.yml` — Prometheus datasource, `http://prometheus:9090`

**`docker-compose.yaml` additions:**
- `prometheus` service: `prom/prometheus:v2.52.0`, port 9090, 30d retention, mounts prometheus.yml
- `grafana` service: `grafana/grafana:10.4.0`, port 3001→3000, mounts provisioning dir, `GRAFANA_ADMIN_PASSWORD` env var (default: `admin`)
- Two new named volumes: `prometheus_data`, `grafana_data`

**`.env` addition required:** `GRAFANA_ADMIN_PASSWORD=your-password` (defaults to `admin` if unset)

**Access:** `http://localhost:3001` (Grafana), `http://localhost:9090` (Prometheus)

---

## 6. Kubernetes Manifests

**New directory structure:**
```
deployments/
├── prometheus/
│   ├── prometheus.yml        # scrape config
│   └── deploy.yaml           # ConfigMap + Deployment + Service
└── grafana/
    ├── provisioning/
    │   └── datasources/
    │       └── prometheus.yml
    └── deploy.yaml           # 2x ConfigMap + Deployment + Service
```

### Prometheus (`deployments/prometheus/deploy.yaml`)

| Resource | Details |
|---|---|
| ConfigMap `prometheus-config` | Embeds prometheus.yml, scrapes `backend-agent-service:8000` |
| Deployment `prometheus` | `prom/prometheus:v2.52.0`, emptyDir storage, requests 100m/256Mi, limits 500m/512Mi |
| Service `prometheus-service` | ClusterIP, port 9090 |

### Grafana (`deployments/grafana/deploy.yaml`)

| Resource | Details |
|---|---|
| ConfigMap `grafana-datasource` | Datasource pointing to `prometheus-service:9090` |
| ConfigMap `grafana-dashboard` | Full dashboard JSON (voice pipeline panels) |
| Deployment `grafana` | `grafana/grafana:10.4.0`, mounts both ConfigMaps, requests 50m/64Mi, limits 200m/256Mi |
| Service `grafana-service` | ClusterIP, port 3000 |

**Namespace:** `english-speaking-agent` (all resources)
**Labels:** `app`, `tier: monitoring`, `project: english-speaking-agent`
**Storage:** `emptyDir` — dashboards survive pod restart via ConfigMap; Prometheus data resets (acceptable for dev/staging)

**Access:**
```bash
kubectl port-forward svc/grafana-service 3001:3000 -n english-speaking-agent
kubectl port-forward svc/prometheus-service 9090:9090 -n english-speaking-agent
```

---

## 7. Grafana Dashboard — "Voice Agent — Pipeline"

One dashboard, four row sections, provisioned via ConfigMap.

### Row 1 — LLM
| Panel | Type | PromQL |
|---|---|---|
| Request rate | Time series | `rate(llm_requests_total[5m])` by `status` |
| Latency p50/p95/p99 | Time series | `histogram_quantile(0.N, rate(llm_latency_seconds_bucket[5m]))` |
| TTFT p50/p95/p99 | Time series | `histogram_quantile(0.N, rate(llm_ttft_seconds_bucket[5m]))` |
| Token burn rate | Time series | `rate(llm_tokens_total[5m])` by `token_type` |
| Cost/hr | Stat | `increase(llm_cost_usd_total[1h])` |
| Error rate | Time series | `rate(llm_requests_total{status="error"}[5m])` |

### Row 2 — STT
| Panel | Type | PromQL |
|---|---|---|
| Request rate | Time series | `rate(stt_requests_total[5m])` |
| Latency p50/p95/p99 | Time series | `histogram_quantile(0.N, rate(stt_latency_seconds_bucket[5m]))` |
| Error rate | Time series | `rate(stt_requests_total{status="error"}[5m])` |

### Row 3 — TTS
| Panel | Type | PromQL |
|---|---|---|
| Request rate | Time series | `rate(tts_requests_total[5m])` |
| Latency p50/p95/p99 | Time series | `histogram_quantile(0.N, rate(tts_latency_seconds_bucket[5m]))` |
| Error rate | Time series | `rate(tts_requests_total{status="error"}[5m])` |

### Row 4 — Guardrails
| Panel | Type | PromQL |
|---|---|---|
| Block rate | Time series | `rate(guardrail_decisions_total{decision="blocked"}[5m])` |
| Allow vs block ratio | Time series | `rate(guardrail_decisions_total[5m])` by `decision` |

---

## 8. Files Changed / Created

| File | Action |
|---|---|
| `app/services/groq_llm.py` | Modify — `invoke()` → `astream()`, add TTFT timing |
| `app/agents/pipeline.py` | Modify — `await` LLM call sites |
| `app/core/metrics.py` | Modify — add `llm_ttft_seconds` histogram + `record_span_metrics()` update |
| `docker-compose.yaml` | Modify — add prometheus + grafana services + volumes |
| `deployments/prometheus/prometheus.yml` | Create |
| `deployments/prometheus/deploy.yaml` | Create |
| `deployments/grafana/provisioning/datasources/prometheus.yml` | Create |
| `deployments/grafana/deploy.yaml` | Create |

**Total:** 3 modified files, 4 new files. No deletions.

---

## 9. Out of Scope

- Alerting rules (Grafana Alerts / AlertManager)
- kube-state-metrics / node-exporter (infra metrics)
- Prometheus PVC for K8s (add when moving to production)
- LLM-as-judge / hallucination metrics (tracked as placeholder in metrics.py)
- Kibana changes (logs stack untouched)

# Infrastructure Overview

The application runs as a set of containerized services. Two deployment targets are supported:

| Target | Tooling | Guide |
|--------|---------|-------|
| Local development | Docker Compose | [local-development.md](./local-development.md) |
| Cloud (GCP / AWS) | Kubernetes + Terraform | [kubernetes.md](./kubernetes.md), [terraform.md](./terraform.md) |

CI/CD is covered in [ci-cd.md](./ci-cd.md).

---

## Services Map

```
                         ┌─────────────────────────────────────────────────────────────┐
                         │                    Docker Compose / Kubernetes               │
                         │                                                               │
  Browser / Client ──────┼──► frontend :3000 (nginx)                                   │
                         │         │                                                     │
                         │         │ /api/*  proxy                                       │
                         │         ▼                                                     │
                         │    backend :8000 (FastAPI / uvicorn)                         │
                         │         │                                                     │
                         │    ┌────┼─────────────────────────────┐                      │
                         │    │    │                             │                      │
                         │    ▼    ▼                             ▼                      │
                         │ postgres:5432  redis:6379       minio:9000/9001              │
                         │ (PostgreSQL 16) (Redis 7)        (Object Storage)            │
                         │    │                                                          │
                         │    └── pgadmin:5050 (DB admin UI)                            │
                         │                                                               │
                         │  ── Observability Stack ──────────────────────────────────── │
                         │                                                               │
                         │  vector (log shipper) ──► elasticsearch:9200                 │
                         │                               │                              │
                         │                           kibana:5601 (log explorer)         │
                         │                                                               │
                         │  backend (metrics) ──► prometheus:9090 ──► grafana:3001      │
                         │                                                               │
                         └─────────────────────────────────────────────────────────────┘

  External APIs called by backend:
    ┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐  ┌────────────┐
    │  Groq (LLM)    │  │  ElevenLabs TTS │  │  Azure Speech STT  │  │  Resend    │
    │  (HTTPS/443)   │  │  (HTTPS/443)    │  │  (HTTPS/443)       │  │  (email)   │
    └────────────────┘  └─────────────────┘  └────────────────────┘  └────────────┘
```

---

## Monitoring

The observability stack is composed of four components, all defined in `deployments/`:

| Component | Image | Role |
|-----------|-------|------|
| **Prometheus** `v2.52.0` | `prom/prometheus` | Scrapes metrics from backend and stores time-series data with 30-day retention. Config at `deployments/prometheus/prometheus.yml`. |
| **Grafana** `10.4.0` | `grafana/grafana` | Dashboards sourced from `deployments/grafana/provisioning/`. Accessible at `:3001` (local) or `/grafana/*` (cloud). |
| **Vector** `0.38.0` | `timberio/vector:0.38.0-alpine` | Tails structured log files from `./logs/`, parses them, and ships to Elasticsearch. Config at `deployments/vector/vector.yaml`. |
| **Elasticsearch** `8.13.0` | `docker.elastic.co/elasticsearch/elasticsearch` | Single-node log store with security disabled for local use. An init container creates ILM policies, component templates, and index templates on first boot. |
| **Kibana** `8.13.0` | `docker.elastic.co/kibana/kibana` | Log exploration UI at `:5601`. An init container creates three data views: `Voice Agent - Spans`, `Voice Agent - Audit`, `Voice Agent - Plain`. |

---

## Key Environment Variables

The backend service requires the following environment variables. Static values are injected directly via `docker-compose.yaml`; secrets must be provided in a `.env` file.

### Injected by docker-compose.yaml (no .env needed)

| Variable | Value | Description |
|----------|-------|-------------|
| `POSTGRES_HOST` | `postgres` | Internal Docker DNS name for the database container |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `MINIO_ENDPOINT` | `minio:9000` | Internal MinIO S3-compatible endpoint |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Allowed CORS origins for local development |
| `TZ` | `Asia/Ho_Chi_Minh` | Container timezone |

### Required in `.env` file (secrets and per-environment config)

| Variable | Used by | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | postgres, backend | Database name |
| `POSTGRES_USER` | postgres, backend | Database user |
| `POSTGRES_PASSWORD` | postgres, backend | Database password |
| `PGADMIN_DEFAULT_EMAIL` | pgadmin | pgAdmin login email |
| `PGADMIN_DEFAULT_PASSWORD` | pgadmin | pgAdmin login password |
| `MINIO_ROOT_USER` | minio | MinIO root access key |
| `MINIO_ROOT_PASSWORD` | minio | MinIO root secret key |
| `GRAFANA_ADMIN_PASSWORD` | grafana | Grafana admin password (defaults to `admin`) |
| `JWT_SECRET_KEY` | backend | Secret key for JWT token signing |
| `GROQ_API_KEY` | backend | Groq LLM API key |
| `ELEVENLABS_API_KEY` | backend | ElevenLabs TTS API key |
| `AZURE_SPEECH_KEY` | backend | Azure Cognitive Services Speech key |
| `AZURE_SPEECH_REGION` | backend | Azure region for Speech service |
| `RESEND_API_KEY` | backend | Resend transactional email API key |

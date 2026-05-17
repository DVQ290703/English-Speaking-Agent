# Local Development Guide

This guide covers running the full application stack locally using Docker Compose.

---

## Prerequisites

- **Docker Desktop** 4.x or later (includes Docker Engine and Docker Compose v2)
- **Git** to clone the repository
- A `.env` file in the project root (see below)

---

## Environment Variables

Create a `.env` file at the project root before the first `docker compose up`. The following variables are required:

```dotenv
# PostgreSQL
POSTGRES_DB=voice_agent
POSTGRES_USER=voice_agent_user
POSTGRES_PASSWORD=changeme

# pgAdmin
PGADMIN_DEFAULT_EMAIL=admin@example.com
PGADMIN_DEFAULT_PASSWORD=changeme

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=changeme

# Grafana (optional — defaults to "admin" if omitted)
GRAFANA_ADMIN_PASSWORD=admin

# JWT
JWT_SECRET_KEY=a-secret-key-at-least-32-chars-long!

# External API keys
GROQ_API_KEY=gsk_...
ELEVENLABS_API_KEY=...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
RESEND_API_KEY=re_...
```

The backend service also receives several static values injected directly by `docker-compose.yaml` (no `.env` entry needed):

| Variable | Value |
|----------|-------|
| `POSTGRES_HOST` | `postgres` |
| `POSTGRES_PORT` | `5432` |
| `MINIO_ENDPOINT` | `minio:9000` |
| `REDIS_URL` | `redis://redis:6379/0` |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173` |
| `TZ` | `Asia/Ho_Chi_Minh` |

---

## Starting the Stack

Build all images and start every service in the background:

```bash
docker compose up --build -d
```

To start only the core services (backend + its dependencies, without the observability stack):

```bash
docker compose up --build -d backend frontend postgres redis minio pgadmin
```

To follow logs across all containers:

```bash
docker compose logs -f
```

---

## Service Ports

Once the stack is running the following ports are available on `localhost`:

| Service | Port | URL |
|---------|------|-----|
| Frontend (nginx) | `3000` | http://localhost:3000 |
| Backend (FastAPI) | `8000` | http://localhost:8000/docs |
| PostgreSQL | `5432` | `psql -h localhost -U <POSTGRES_USER> -d <POSTGRES_DB>` |
| pgAdmin | `5050` | http://localhost:5050 |
| Redis | `6379` | `redis-cli -h localhost` |
| MinIO API | `9000` | http://localhost:9000 |
| MinIO Console | `9001` | http://localhost:9001 |
| Elasticsearch | `9200` | http://localhost:9200 |
| Kibana | `5601` | http://localhost:5601 |
| Prometheus | `9090` | http://localhost:9090 |
| Grafana | `3001` | http://localhost:3001 |

---

## Backend Image

The backend is built from a two-stage `Dockerfile`:

- **Stage 1 (`builder`)** — `python:3.10-slim`. Installs `gcc`, `build-essential`, and `libffi-dev`, creates a virtualenv at `/venv`, and installs Python dependencies from `requirements.txt`.
- **Stage 2 (runtime)** — copies only the virtualenv and application code, runs as a non-root user `app`.

---

## Database Seeding

The database is seeded automatically on first boot. Docker Compose mounts two SQL files into the PostgreSQL `docker-entrypoint-initdb.d/` directory:

| File | Order | Purpose |
|------|-------|---------|
| `db_schema/schema.sql` | 01 | Creates all tables and indexes |
| `db_schema/seed.sql` | 02 | Inserts initial seed data |

These scripts run only when the `postgres_data` volume is empty (i.e. on first start). To re-seed from scratch, remove the volume:

```bash
docker compose down -v          # removes all named volumes
docker compose up --build -d    # fresh start — seed runs automatically
```

---

## Running Tests

Tests run against a lightweight in-memory config (see `tests/conftest.py`) and do not require a running database:

```bash
# Run tests inside a one-off container (mirrors CI)
docker compose run --rm backend python -m pytest tests/ --tb=short

# Or run tests directly on the host (requires Python 3.10 + dependencies installed)
pip install uv
uv pip install -r requirements.txt -r requirements-test.txt --system
python -m pytest tests/ --tb=short
```

---

## Useful Docker Commands

```bash
# Rebuild a single service without restarting others
docker compose up --build -d backend

# View logs for a specific service
docker compose logs -f backend

# Open a shell inside the running backend container
docker compose exec backend bash

# Open psql inside the running postgres container
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB

# Stop all services (keeps volumes)
docker compose down

# Stop all services and delete all volumes (full reset)
docker compose down -v

# List all running containers
docker compose ps

# Check resource usage
docker stats
```

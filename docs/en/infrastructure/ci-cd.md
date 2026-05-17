# CI/CD Guide

The project uses two CI systems in parallel:

| System | File | Responsibility |
|--------|------|---------------|
| **GitLab CI** | `.gitlab-ci.yml` | Build Docker images with Kaniko, deploy to GKE |
| **GitHub Actions** | `.github/workflows/test.yml` | Run the pytest test suite on push / PR |

---

## GitLab CI Pipeline

### Stages

```
build  →  deploy
```

The `test` stage is defined in the file but is currently commented out; tests are gated by GitHub Actions instead. When uncommented, it would gate the build and deploy stages.

| Stage | Job | Trigger |
|-------|-----|---------|
| `build` | `build-backend` | Push to `main` when `app/**/*`, `Dockerfile`, or `requirements.txt` changes |
| `build` | `build-frontend` | Push to `main` when `frontend/**/*` or `Dockerfile.frontend` changes |
| `deploy` | `deploy-backend` | After `build-backend` succeeds (same path filter) |
| `deploy` | `deploy-backend-manifest` | Push to `main` when `deployments/backend/**/*` changes (no build needed) |
| `deploy` | `deploy-frontend` | After `build-frontend` succeeds (same path filter) |
| `deploy` | `deploy-frontend-manifest` | Push to `main` when `deployments/frontend/**/*` changes (no build needed) |
| `deploy` | `deploy-ingress` | Push to `main` when `deployments/ingress.yaml` changes |

All jobs run on the `AWS-Gitlab-runner` tag.

---

### Kaniko Builds

Build jobs use `gcr.io/kaniko-project/executor:v1.23.2-debug` directly (no Docker daemon required). Before building, a YAML anchor (`kaniko_auth`) writes Harbor registry credentials to `/kaniko/.docker/config.json`.

Image tags follow the pattern `<DATE>-<CI_COMMIT_SHORT_SHA>` (e.g. `20260516-abc1234`). A `latest` tag is also pushed on every build. Layer caching is enabled via `--cache-repo`.

```
# Backend image destinations
vinai-registry.duckdns.org/english-speaking-agent/backend:<DATE>-<SHA>
vinai-registry.duckdns.org/english-speaking-agent/backend:latest

# Frontend image destinations
vinai-registry.duckdns.org/english-speaking-agent/frontend:<DATE>-<SHA>
vinai-registry.duckdns.org/english-speaking-agent/frontend:latest

# Build cache repository
vinai-registry.duckdns.org/english-speaking-agent/cache
```

---

### GCP / GKE Deploy

Deploy jobs use `google/cloud-sdk:alpine`. Authentication uses **GCP Workload Identity Federation** — no Service Account key is stored. The flow:

1. Write the predefined `CI_JOB_JWT_V2` OIDC token to `/tmp/gitlab-token.txt`.
2. Build a WIF credential config JSON referencing the token file and the SA impersonation URL.
3. `gcloud auth login --cred-file=/tmp/wif-cred.json`
4. `gcloud container clusters get-credentials` to configure `kubectl`.
5. Credential files are deleted immediately after auth.

Deploy steps (backend example):

```bash
kubectl apply -f deployments/backend/prompts-configmap.yaml
kubectl apply -f deployments/backend/deploy.yaml
kubectl set image deployment/backend-agent backend=<VERSION_TAG> -n english-speaking-agent
kubectl rollout status deployment/backend-agent -n english-speaking-agent --timeout=300s
```

---

### Required GitLab CI Variables

Configure these in **Settings → CI/CD → Variables** for your GitLab project. Mark sensitive values as **Masked**.

| Variable | Masked | Description |
|----------|--------|-------------|
| `HARBOR_USER` | No | Harbor registry username |
| `HARBOR_PASSWORD` | Yes | Harbor registry password |
| `GCP_PROJECT_ID` | No | GCP project ID (e.g. `vinuniai`) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | No | Full WIF provider resource name: `projects/<NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>` |
| `GCP_SERVICE_ACCOUNT` | No | Service account email (e.g. `gitlab-deployer@vinuniai.iam.gserviceaccount.com`) |
| `GKE_CLUSTER_NAME` | No | GKE cluster name (e.g. `vinai-cluster`) |
| `GKE_CLUSTER_ZONE` | No | GKE cluster zone (e.g. `us-central1-a`) |

The following variables are defined directly in `.gitlab-ci.yml` (not required in the GitLab UI):

| Variable | Value |
|----------|-------|
| `HARBOR_REGISTRY` | `vinai-registry.duckdns.org` |
| `HARBOR_PROJECT` | `english-speaking-agent` |
| `IMAGE_BACKEND` | `vinai-registry.duckdns.org/english-speaking-agent/backend` |
| `IMAGE_FRONTEND` | `vinai-registry.duckdns.org/english-speaking-agent/frontend` |
| `CACHE_REPO` | `vinai-registry.duckdns.org/english-speaking-agent/cache` |
| `K8S_NAMESPACE` | `english-speaking-agent` |

> **Note:** `CI_JOB_JWT_V2` is a predefined GitLab variable (available since GitLab 14.9). If it is empty, enable it in **Admin → Settings → Network → Token Access**.

---

## GitHub Actions — Test Workflow

File: `.github/workflows/test.yml`

### Triggers

- **Push** to `main` or `develop`
- **Pull request** targeting `main`

### Job: `pytest · Python 3.10`

Runs on `ubuntu-latest`.

| Step | Action |
|------|--------|
| Checkout code | `actions/checkout@v4` |
| Set up Python 3.10 | `actions/setup-python@v5` |
| Install `uv` | `pip install uv` |
| Install production deps | `uv pip install -r requirements.txt --system` |
| Install test deps | `uv pip install -r requirements-test.txt --system` |
| Run test suite | `python -m pytest tests/ --tb=short` |
| Upload coverage (optional) | `pytest --cov=app --cov-report=xml` (always runs, failures are non-fatal) |

### Environment Variables Injected by the Workflow

| Variable | Value | Reason |
|----------|-------|--------|
| `JWT_SECRET_KEY` | `ci-test-secret-key-for-github-ci!` | Must be at least 32 bytes; `conftest.py` sets all other test defaults |

No other secrets are required — the test suite uses in-memory mocks for all external services (database, Redis, MinIO, external APIs).

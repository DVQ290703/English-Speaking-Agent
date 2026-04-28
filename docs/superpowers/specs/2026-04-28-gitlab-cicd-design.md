# GitLab CI/CD Pipeline Design — English Speaking Agent

**Date:** 2026-04-28  
**Status:** Approved

---

## Overview

Automate the build and deployment of the English Speaking Agent (backend + frontend) using GitLab CI/CD, triggered by a GitHub → GitLab mirror sync. CI/CD runs only on the `main` branch; all other branches are mirrored silently.

---

## Infrastructure

| Component | Detail |
|---|---|
| Source of truth | GitHub (private repo) |
| CI/CD platform | Self-hosted GitLab + GitLab Runner |
| Container registry | Harbor — `vinai-registry.duckdns.org/english-speaking-agent/` |
| Target environment | Kubernetes cluster, namespace `english-speaking-agent` |
| Docker build tool | Kaniko (no privileged runner required) |
| K8s deploy tool | `kubectl apply -f` |
| K8s auth | `KUBECONFIG` stored as a GitLab CI File variable |

---

## Files Created / Modified

| File | Action |
|---|---|
| `.github/workflows/sync_to_gitlab.yml` | Replace — mirror all branches instead of only `TheAnh` |
| `.gitlab-ci.yml` | Create — full pipeline definition |
| `deployments/backend/deploy.yaml` | Create — K8s Namespace + Deployment + Service for backend |

---

## Section 1: GitHub → GitLab Sync

Replace the existing single-branch sync with a full mirror:

```yaml
# .github/workflows/sync_to_gitlab.yml
on:
  push:
    branches: ['**']   # all branches

# Uses git push --mirror to sync every ref
# Secret required: GITLAB_TOKEN (already exists)
```

GitLab CI is triggered automatically after the mirror lands. Branch filtering is handled on the GitLab side via `rules:`.

---

## Section 2: GitLab CI/CD Pipeline

### Stage structure

```
build  →  deploy
```

Push is implicit — Kaniko builds and pushes to Harbor in a single step. No separate push stage needed.

### Jobs

| Job | Stage | Runs when |
|---|---|---|
| `build-backend` | build | `app/**`, `Dockerfile`, `requirements*.txt` changed on `main` |
| `build-frontend` | build | `frontend/**`, `Dockerfile.frontend` changed on `main` |
| `deploy-backend` | deploy | same paths as build-backend + `deployments/backend/**` |
| `deploy-frontend` | deploy | same paths as build-frontend + `deployments/frontend/**` |

### Path-based filtering

Each job uses `rules: changes:` to only run when its relevant source paths are modified. If neither backend nor frontend paths change (e.g. only README), no jobs run.

### Job dependencies

Deploy jobs declare `needs:` their build counterpart with `optional: true`. This handles two scenarios correctly:
- **Source changed**: build runs first, then deploy (sequential)
- **Only manifest changed**: build is skipped, deploy still runs to apply the updated manifest (`kubectl apply -f` is idempotent)

### Image tagging

Each Kaniko job produces two tags:
- `<YYYYMMDD>-<CI_COMMIT_SHORT_SHA>` — versioned, immutable
- `latest` — stable pointer, updated on every successful main build

Matches the existing `publish.sh` convention.

### Caching

Kaniko uses `--cache=true` with a dedicated cache repository:
- `vinai-registry.duckdns.org/english-speaking-agent/cache`

Cache is stored in Harbor alongside the built images.

---

## Section 3: Backend Kubernetes Manifest

**File:** `deployments/backend/deploy.yaml`

| Resource | Detail |
|---|---|
| Namespace | `english-speaking-agent` (shared with frontend, idempotent) |
| Deployment replicas | 2 |
| Strategy | RollingUpdate — maxSurge: 1, maxUnavailable: 0 (zero-downtime) |
| Image | `vinai-registry.duckdns.org/english-speaking-agent/backend:latest` |
| Port | 8000 (uvicorn) |
| Env vars | Loaded from K8s Secret `backend-secret` via `envFrom.secretRef` |
| Resources | requests: 100m CPU / 128Mi RAM; limits: 500m CPU / 512Mi RAM |
| Health probes | readiness + liveness on `GET /health` port 8000 |
| imagePullSecrets | `harbor-registry-secret` |
| Service type | ClusterIP (internal only, port 8000) |
| Service name | `backend-agent-service` (matches `INTERNAL_API_URL` in frontend ConfigMap) |

Sensitive env vars (Postgres, MinIO, JWT, API keys) are kept in the K8s Secret, not in any CI variable or ConfigMap.

---

## Section 4: Secrets & Variables

### GitHub Secrets

| Secret | Purpose |
|---|---|
| `GITLAB_TOKEN` | OAuth2 token to push to GitLab (already exists) |

### GitLab CI/CD Variables

| Variable | Type | Purpose |
|---|---|---|
| `HARBOR_USER` | Variable | Harbor registry username |
| `HARBOR_PASSWORD` | Secret | Harbor registry password |
| `KUBECONFIG` | File | Raw kubeconfig for the K8s cluster |

### One-time K8s setup (manual, run once)

```bash
# App secrets — from your .env file
kubectl create secret generic backend-secret \
  --from-env-file=.env \
  -n english-speaking-agent

# Harbor image pull secret (if not already created)
kubectl create secret docker-registry harbor-registry-secret \
  --docker-server=vinai-registry.duckdns.org \
  --docker-username=<user> \
  --docker-password=<password> \
  -n english-speaking-agent
```

---

## Pre-flight Checklist (before pipeline works)

- [ ] `HARBOR_USER` added to GitLab CI variables
- [ ] `HARBOR_PASSWORD` added to GitLab CI variables (masked)
- [ ] `KUBECONFIG` added to GitLab CI variables (File type)
- [ ] `backend-secret` K8s Secret created in namespace
- [ ] `harbor-registry-secret` K8s Secret created in namespace
- [ ] Harbor cache repo exists or Kaniko has permission to create it

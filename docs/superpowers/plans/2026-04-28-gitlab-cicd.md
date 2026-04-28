# GitLab CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate build, test, and deployment of the English Speaking Agent via a GitHub → GitLab mirror pipeline that runs pytest, builds Docker images with Kaniko, and deploys to Kubernetes on every push to `main`.

**Architecture:** GitHub Actions mirrors all branches to a self-hosted GitLab instance. GitLab CI runs a `test → build → deploy` pipeline gated to `main`. Build jobs are path-filtered so only the changed component (backend or frontend) is rebuilt. Deploy jobs use `kubectl apply -f` with a `KUBECONFIG` File variable for cluster auth.

**Tech Stack:** GitHub Actions, GitLab CI, Kaniko (`gcr.io/kaniko-project/executor:v1.23.2-debug`), Harbor registry (`vinai-registry.duckdns.org`), `bitnami/kubectl:1.29`, Kubernetes, Python 3.10 / pytest, Node 20 / nginx

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.github/workflows/sync_to_gitlab.yml` | Replace | Mirror all GitHub branches to GitLab on push |
| `.gitlab-ci.yml` | Create | Full test → build → deploy pipeline |
| `deployments/backend/deploy.yaml` | Create | K8s Namespace + Deployment + Service for FastAPI backend |

---

## Task 1: Replace GitHub Sync Workflow

**Files:**
- Modify: `.github/workflows/sync_to_gitlab.yml`

The existing workflow only mirrors the `TheAnh` branch. Replace it to mirror every branch pushed to GitHub.

- [ ] **Step 1: Replace the workflow file**

Replace the entire content of `.github/workflows/sync_to_gitlab.yml` with:

```yaml
name: Sync All Branches to GitLab

on:
  push:
    branches:
      - '**'

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Push branch to GitLab
        run: |
          git remote add gitlab http://oauth2:${{ secrets.GITLAB_TOKEN }}@gitlab-vinai.duckdns.org/root/English-Speaking-Agent.git
          git push gitlab HEAD:${{ github.ref_name }} --force
```

Key changes from the old file:
- `branches: ['**']` — triggers on every branch, not just `TheAnh`
- `git push gitlab HEAD:${{ github.ref_name }} --force` — pushes the branch that triggered the workflow to the same branch name on GitLab
- `fetch-depth: 0` retained to preserve full history

- [ ] **Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/sync_to_gitlab.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync_to_gitlab.yml
git commit -m "ci: mirror all branches to GitLab on push"
```

---

## Task 2: Create Backend Kubernetes Manifest

**Files:**
- Create: `deployments/backend/deploy.yaml`

The frontend already has `deployments/frontend/deploy.yaml`. Mirror its structure for the backend FastAPI service.

Notes before writing:
- Service name must be `backend-agent-service` — this matches the `INTERNAL_API_URL` already configured in the frontend ConfigMap (`http://backend-agent-service.english-speaking-agent.svc.cluster.local:8000`)
- Health probes target `GET /health` — this endpoint exists at `app/main.py:48` and returns `{"status": "ok"}`
- Env vars come from K8s Secret `backend-secret` (created manually once on the cluster, see pre-flight checklist in spec)
- Service type is `ClusterIP` — the backend is internal only

- [ ] **Step 1: Create the manifest**

Create `deployments/backend/deploy.yaml` with this content:

```yaml
# =============================================================================
# Backend Deployment Manifest — English Speaking Agent
# Apply  : kubectl apply -f deployments/backend/deploy.yaml
# Status : kubectl get pods -l app=backend-agent -n english-speaking-agent
# =============================================================================

# ── Namespace ─────────────────────────────────────────────────────────────────
# Shared with frontend. Idempotent — safe to re-apply.
apiVersion: v1
kind: Namespace
metadata:
  name: english-speaking-agent
  labels:
    project: english-speaking-agent

---

# ── Deployment ────────────────────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-agent
  namespace: english-speaking-agent
  labels:
    app: backend-agent
    tier: backend
    project: english-speaking-agent
spec:
  replicas: 2

  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0    # zero-downtime: never kill a pod before a new one is ready

  selector:
    matchLabels:
      app: backend-agent
      tier: backend

  template:
    metadata:
      labels:
        app: backend-agent
        tier: backend
        project: english-speaking-agent
    spec:
      # Allow scheduling on control-plane nodes (single-node/dev clusters).
      # Remove once dedicated worker nodes are available.
      tolerations:
        - key: "node-role.kubernetes.io/control-plane"
          operator: "Exists"
          effect: "NoSchedule"

      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: backend-agent

      containers:
        - name: backend
          image: vinai-registry.duckdns.org/english-speaking-agent/backend:latest
          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8000
              protocol: TCP

          # All sensitive env vars (Postgres, MinIO, JWT, API keys) come from
          # the backend-secret K8s Secret. Create it once with:
          #   kubectl create secret generic backend-secret \
          #     --from-env-file=.env -n english-speaking-agent
          envFrom:
            - secretRef:
                name: backend-secret

          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"

          # ── Readiness Probe ────────────────────────────────────────────────
          # Pod only receives traffic once /health returns 200.
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3

          # ── Liveness Probe ─────────────────────────────────────────────────
          # Restarts the container if uvicorn stops responding.
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 20
            periodSeconds: 20
            failureThreshold: 3

          # ── Security Context ───────────────────────────────────────────────
          # Dockerfile already runs as non-root user 'app'.
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true

      # Pull from the private Harbor registry.
      imagePullSecrets:
        - name: harbor-registry-secret

---

# ── Service ───────────────────────────────────────────────────────────────────
# ClusterIP: internal only. Frontend reaches backend via this DNS name:
#   http://backend-agent-service.english-speaking-agent.svc.cluster.local:8000
apiVersion: v1
kind: Service
metadata:
  name: backend-agent-service
  namespace: english-speaking-agent
  labels:
    app: backend-agent
    tier: backend
    project: english-speaking-agent
spec:
  type: ClusterIP
  selector:
    app: backend-agent
    tier: backend
  ports:
    - name: http
      protocol: TCP
      port: 8000
      targetPort: http
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python -c "
import yaml
docs = list(yaml.safe_load_all(open('deployments/backend/deploy.yaml')))
print(f'YAML valid — {len(docs)} documents')
"
```

Expected: `YAML valid — 3 documents`

- [ ] **Step 3: Dry-run against cluster (if kubectl is available)**

```bash
kubectl apply -f deployments/backend/deploy.yaml --dry-run=client
```

Expected output (3 lines):
```
namespace/english-speaking-agent configured (dry run)
deployment.apps/backend-agent created (dry run)
service/backend-agent-service created (dry run)
```

Skip this step if kubectl is not configured locally — the CI pipeline will apply it.

- [ ] **Step 4: Commit**

```bash
git add deployments/backend/deploy.yaml
git commit -m "feat(k8s): add backend deployment manifest"
```

---

## Task 3: Create `.gitlab-ci.yml` — Test Stage

**Files:**
- Create: `.gitlab-ci.yml`

Build the pipeline file incrementally. Start with the skeleton (variables + stages) and the `test-backend` job. Validate before adding more stages.

- [ ] **Step 1: Create the file with variables, stages, and test job**

Create `.gitlab-ci.yml`:

```yaml
# =============================================================================
# GitLab CI/CD Pipeline — English Speaking Agent
#
# Stages:
#   test   — pytest (always runs on main, gates build + deploy)
#   build  — Kaniko builds backend and/or frontend (path-filtered)
#   deploy — kubectl apply (path-filtered, optional dependency on build)
#
# Required GitLab CI Variables (Settings → CI/CD → Variables):
#   HARBOR_USER     — Harbor registry username
#   HARBOR_PASSWORD — Harbor registry password  (masked)
#   KUBECONFIG      — Raw kubeconfig content     (File type)
# =============================================================================

variables:
  HARBOR_REGISTRY: "vinai-registry.duckdns.org"
  HARBOR_PROJECT:  "english-speaking-agent"
  IMAGE_BACKEND:   "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/backend"
  IMAGE_FRONTEND:  "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/frontend"
  CACHE_REPO:      "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/cache"

stages:
  - test
  - build
  - deploy

# =============================================================================
# Stage: test
# Runs on every push to main regardless of which files changed.
# All build and deploy jobs depend on this passing.
# =============================================================================

test-backend:
  stage: test
  image: python:3.10-slim
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  before_script:
    - pip install --quiet uv
    - uv pip install -r requirements.txt -r requirements-test.txt --system --quiet
  script:
    - python -m pytest tests/ --tb=short
  variables:
    JWT_SECRET_KEY: "ci-test-secret-key-for-gitlab-ci!"
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('.gitlab-ci.yml')); print('YAML valid')"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .gitlab-ci.yml
git commit -m "ci: add GitLab CI skeleton with test stage"
```

---

## Task 4: Add Build Stage (Kaniko) to `.gitlab-ci.yml`

**Files:**
- Modify: `.gitlab-ci.yml`

Append the `build-backend` and `build-frontend` jobs. Both use Kaniko to build and push to Harbor in one step (no separate push job). Each job:
- Runs only on `main` when its source paths change
- Depends on `test-backend` passing
- Produces two tags: `<YYYYMMDD>-<CI_COMMIT_SHORT_SHA>` and `latest`
- Uses a YAML anchor `&kaniko_auth` for the Harbor login config to avoid repetition

- [ ] **Step 1: Append build jobs to `.gitlab-ci.yml`**

Add the following to the end of `.gitlab-ci.yml`:

```yaml
# =============================================================================
# Kaniko auth helper — merged into each build job via YAML anchor
# Writes Harbor credentials to /kaniko/.docker/config.json before build.
# =============================================================================

.kaniko_auth: &kaniko_auth
  before_script:
    - mkdir -p /kaniko/.docker
    - AUTH=$(echo -n "${HARBOR_USER}:${HARBOR_PASSWORD}" | base64 | tr -d '\n')
    - echo "{\"auths\":{\"${HARBOR_REGISTRY}\":{\"auth\":\"${AUTH}\"}}}" > /kaniko/.docker/config.json

# =============================================================================
# Stage: build
# Path-filtered: only runs when the component's source files change.
# =============================================================================

build-backend:
  stage: build
  needs:
    - job: test-backend
  image:
    name: gcr.io/kaniko-project/executor:v1.23.2-debug
    entrypoint: [""]
  <<: *kaniko_auth
  script:
    - DATE=$(date +%Y%m%d)
    - VERSION_TAG="${IMAGE_BACKEND}:${DATE}-${CI_COMMIT_SHORT_SHA}"
    - LATEST_TAG="${IMAGE_BACKEND}:latest"
    - |
      /kaniko/executor \
        --context "${CI_PROJECT_DIR}" \
        --dockerfile "${CI_PROJECT_DIR}/Dockerfile" \
        --destination "${VERSION_TAG}" \
        --destination "${LATEST_TAG}" \
        --cache=true \
        --cache-repo "${CACHE_REPO}"
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      changes:
        - app/**/*
        - Dockerfile
        - requirements.txt
        - requirements-test.txt

build-frontend:
  stage: build
  needs:
    - job: test-backend
  image:
    name: gcr.io/kaniko-project/executor:v1.23.2-debug
    entrypoint: [""]
  <<: *kaniko_auth
  script:
    - DATE=$(date +%Y%m%d)
    - VERSION_TAG="${IMAGE_FRONTEND}:${DATE}-${CI_COMMIT_SHORT_SHA}"
    - LATEST_TAG="${IMAGE_FRONTEND}:latest"
    - |
      /kaniko/executor \
        --context "${CI_PROJECT_DIR}" \
        --dockerfile "${CI_PROJECT_DIR}/Dockerfile.frontend" \
        --destination "${VERSION_TAG}" \
        --destination "${LATEST_TAG}" \
        --cache=true \
        --cache-repo "${CACHE_REPO}"
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      changes:
        - frontend/**/*
        - Dockerfile.frontend
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('.gitlab-ci.yml')); print('YAML valid')"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .gitlab-ci.yml
git commit -m "ci: add Kaniko build jobs for backend and frontend"
```

---

## Task 5: Add Deploy Stage to `.gitlab-ci.yml`

**Files:**
- Modify: `.gitlab-ci.yml`

Append the `deploy-backend` and `deploy-frontend` jobs. Both use `bitnami/kubectl:1.29`. GitLab automatically sets `$KUBECONFIG` to the path of the kubeconfig file when the variable is configured as **File** type — no manual setup needed in the script.

Deploy jobs use `needs: optional: true` so they still run when only a manifest file changed (no build was triggered).

- [ ] **Step 1: Append deploy jobs to `.gitlab-ci.yml`**

Add the following to the end of `.gitlab-ci.yml`:

```yaml
# =============================================================================
# Stage: deploy
# Path-filtered: runs when source OR manifest files change.
# needs: optional: true — deploy still runs if only the manifest changed
# (build was skipped), e.g. when updating resource limits or replicas.
# KUBECONFIG is a GitLab CI File variable — kubectl picks it up automatically.
# =============================================================================

deploy-backend:
  stage: deploy
  image: bitnami/kubectl:1.29
  needs:
    - job: build-backend
      optional: true
  script:
    - kubectl apply -f deployments/backend/deploy.yaml
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      changes:
        - app/**/*
        - Dockerfile
        - requirements.txt
        - requirements-test.txt
        - deployments/backend/**/*

deploy-frontend:
  stage: deploy
  image: bitnami/kubectl:1.29
  needs:
    - job: build-frontend
      optional: true
  script:
    - kubectl apply -f deployments/frontend/deploy.yaml
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      changes:
        - frontend/**/*
        - Dockerfile.frontend
        - deployments/frontend/**/*
```

- [ ] **Step 2: Validate final YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('.gitlab-ci.yml')); print('YAML valid')"
```

Expected: `YAML valid`

- [ ] **Step 3: Lint with GitLab CI API (optional but recommended)**

If you have `curl` and a GitLab personal access token:

```bash
curl --header "PRIVATE-TOKEN: <your-token>" \
     --header "Content-Type: application/json" \
     --data "$(jq -Rs '{content: .}' < .gitlab-ci.yml)" \
     "http://gitlab-vinai.duckdns.org/api/v4/ci/lint" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('Valid' if d.get('valid') else d.get('errors'))"
```

Expected: `Valid`

- [ ] **Step 4: Commit**

```bash
git add .gitlab-ci.yml
git commit -m "ci: add kubectl deploy jobs for backend and frontend"
```

---

## Pre-flight Checklist (before first pipeline run)

These are one-time manual steps on the cluster and in GitLab — they are not part of the CI pipeline itself.

- [ ] Add `HARBOR_USER` to GitLab CI variables (Settings → CI/CD → Variables)
- [ ] Add `HARBOR_PASSWORD` to GitLab CI variables — set as **Masked**
- [ ] Add `KUBECONFIG` to GitLab CI variables — set type to **File**, paste raw kubeconfig content
- [ ] Create backend app secret on cluster:
  ```bash
  kubectl create secret generic backend-secret \
    --from-env-file=.env \
    -n english-speaking-agent
  ```
- [ ] Create Harbor image pull secret on cluster (if not already present):
  ```bash
  kubectl create secret docker-registry harbor-registry-secret \
    --docker-server=vinai-registry.duckdns.org \
    --docker-username=<your-harbor-user> \
    --docker-password=<your-harbor-password> \
    -n english-speaking-agent
  ```
- [ ] Verify Harbor cache repository `english-speaking-agent/cache` exists (or that your Harbor user has permission to create repositories)

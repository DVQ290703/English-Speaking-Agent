# Kubernetes Deployment Guide

All Kubernetes manifests live under `deployments/`. The production cluster is GKE; the same manifests work on any standard Kubernetes cluster.

---

## Namespace

Every workload runs in the `english-speaking-agent` namespace. The namespace is declared at the top of each manifest and is safe to apply multiple times (idempotent):

```bash
kubectl create namespace english-speaking-agent --dry-run=client -o yaml | kubectl apply -f -
```

---

## Repository Layout

```
deployments/
├── backend/
│   ├── deploy.yaml             # Namespace, Deployment, Service
│   └── prompts-configmap.yaml  # System-prompt ConfigMap (agent-prompts)
├── frontend/
│   └── deploy.yaml             # Namespace, Deployment, Service
├── redis/
│   └── redis.yaml              # Deployment, Service
├── minio/
│   └── minio.yaml              # PVC, Deployment, Service (api + console)
├── elasticsearch/
│   ├── deploy.yaml
│   └── index-template.json
├── grafana/
│   ├── deploy.yaml
│   └── dashboard-configmap.yaml
├── prometheus/
│   ├── deploy.yaml
│   └── prometheus.yml
├── vector/
│   └── vector.yaml
└── ingress.yaml                # GKE Ingress, ManagedCertificate, FrontendConfig
```

---

## Applying Manifests

Apply all manifests in dependency order:

```bash
# 1. Stateful services and storage
kubectl apply -f deployments/redis/redis.yaml
kubectl apply -f deployments/minio/minio.yaml

# 2. Observability
kubectl apply -f deployments/elasticsearch/deploy.yaml
kubectl apply -f deployments/prometheus/deploy.yaml
kubectl apply -f deployments/grafana/deploy.yaml
kubectl apply -f deployments/vector/vector.yaml

# 3. Application
kubectl apply -f deployments/backend/prompts-configmap.yaml
kubectl apply -f deployments/backend/deploy.yaml
kubectl apply -f deployments/frontend/deploy.yaml

# 4. Ingress (last — depends on Services being ready)
kubectl apply -f deployments/ingress.yaml
```

Or apply everything at once (order is handled by Kubernetes):

```bash
kubectl apply -R -f deployments/
```

---

## Deployments

| Deployment | Replicas | Image | Port | Strategy |
|------------|----------|-------|------|----------|
| `backend-agent` | 1 | `vinai-registry.duckdns.org/english-speaking-agent/backend:latest` | 8000 | RollingUpdate |
| `frontend-agent` | 1 | `vinai-registry.duckdns.org/english-speaking-agent/frontend:latest` | 80 | RollingUpdate |
| `redis` | 1 | `redis:7-alpine` | 6379 | RollingUpdate |
| `minio` | 1 | `minio/minio:latest` | 9000 / 9001 | Recreate (PVC constraint) |
| `elasticsearch` | 1 | `elasticsearch:8.13.0` | 9200 | RollingUpdate |
| `grafana` | 1 | `grafana/grafana:10.4.0` | 3000 | RollingUpdate |
| `prometheus` | 1 | `prom/prometheus:v2.52.0` | 9090 | RollingUpdate |

All rolling updates are configured with `maxSurge: 1` and `maxUnavailable: 0` (zero-downtime).

---

## Secrets

### backend-secret

All sensitive configuration for the backend (database credentials, MinIO keys, JWT secret, API keys, SMTP settings) is stored in a single Kubernetes Secret named `backend-secret`. MinIO also reads its root credentials from this same secret.

Create it once before the first deploy:

```bash
kubectl create secret generic backend-secret \
  --from-env-file=.env.prod \
  -n english-speaking-agent
```

To update an individual key without recreating:

```bash
kubectl patch secret backend-secret \
  -n english-speaking-agent \
  --type='json' \
  -p='[{"op":"replace","path":"/data/GROQ_API_KEY","value":"'$(echo -n "new-key" | base64)'"}]'
```

### harbor-registry-secret

The image pull secret for the private Harbor registry. Created by the CI/CD pipeline on each deploy (idempotent):

```bash
kubectl create secret docker-registry harbor-registry-secret \
  --docker-server=vinai-registry.duckdns.org \
  --docker-username=<HARBOR_USER> \
  --docker-password=<HARBOR_PASSWORD> \
  -n english-speaking-agent
```

---

## ConfigMaps

### agent-prompts

Holds the system prompt Markdown file(s) for the AI agent. The file is mounted into the backend container at `/app/app/prompts/system_prompt.md`, allowing prompt updates without rebuilding the image.

```bash
# Apply a prompt update
kubectl apply -f deployments/backend/prompts-configmap.yaml

# Force a rolling restart so the new ConfigMap is picked up
kubectl rollout restart deployment/backend-agent -n english-speaking-agent
```

---

## Backend Resource Limits

From `deployments/backend/deploy.yaml`:

| Type | CPU | Memory |
|------|-----|--------|
| Request | `100m` | `128Mi` |
| Limit | `500m` | `512Mi` |

Health probes:

| Probe | Path | Initial Delay | Period |
|-------|------|---------------|--------|
| Readiness | `GET /health` | 10 s | 10 s |
| Liveness | `GET /health` | 20 s | 20 s |

Both probes have `failureThreshold: 3`.

---

## Ingress Routing

`deployments/ingress.yaml` creates a GKE HTTP(S) Load Balancer (`kubernetes.io/ingress.class: gce`) with a GCP-managed TLS certificate for `a20-app-014.duckdns.org`. HTTP traffic is permanently redirected to HTTPS via `FrontendConfig`.

| Path | Backend Service | Port | Notes |
|------|----------------|------|-------|
| `/api/*` | `backend-agent-service` | 8000 | FastAPI — must be listed before `/*` |
| `/storage/*` | `minio-service` | 9000 | MinIO presigned URL public path |
| `/grafana/*` | `grafana-service` | 3000 | Monitoring dashboard |
| `/*` | `frontend-agent-service` | 80 | React SPA catch-all |

After applying the ingress:
1. Get the provisioned IP: `kubectl get ingress vinai-ingress -n english-speaking-agent`
2. Point `a20-app-014.duckdns.org` to that IP in DuckDNS.
3. Wait 15-20 minutes for GCP to provision the TLS certificate.

---

## Useful kubectl Commands

```bash
# Watch pod status across the namespace
kubectl get pods -n english-speaking-agent -w

# Describe a failing pod (events, probe failures)
kubectl describe pod <pod-name> -n english-speaking-agent

# Tail logs from the backend
kubectl logs -f deployment/backend-agent -n english-speaking-agent

# Execute a shell in the backend pod
kubectl exec -it deployment/backend-agent -n english-speaking-agent -- bash

# Check rollout status
kubectl rollout status deployment/backend-agent -n english-speaking-agent

# Roll back a bad deploy
kubectl rollout undo deployment/backend-agent -n english-speaking-agent

# View all services
kubectl get svc -n english-speaking-agent

# View ingress and its assigned IP
kubectl describe ingress vinai-ingress -n english-speaking-agent

# View TLS certificate status
kubectl describe managedcertificate vinai-managed-cert -n english-speaking-agent

# Decode a secret value
kubectl get secret backend-secret -n english-speaking-agent \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 --decode
```

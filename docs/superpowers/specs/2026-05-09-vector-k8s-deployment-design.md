# Vector K8s Deployment Design

**Date:** 2026-05-09
**Branch:** logging/mornitoring
**Scope:** Deploy Vector as a Kubernetes DaemonSet to collect backend pod logs and ship them to the external Elasticsearch server.

---

## Problem

The existing Vector configuration runs in Docker Compose, reading log files from a bind-mounted `./logs` directory and shipping to a local Elasticsearch container. In Kubernetes, the backend writes logs to stdout (via `LOG_DIR`), and Elasticsearch runs as an external server on AWS EC2 (`172.31.45.110:9200`) with HTTPS and API key authentication.

---

## Architecture

```
[Backend pods]                    [Vector DaemonSet]                    [External ES]
 stdout/stderr ──► /var/log/pods ──► kubernetes_logs source
                   (hostPath ro)      ↓ filter: english-speaking-agent_backend-agent-*
                                   extract_prefix transform
                                   parse_payload transform
                                   route_by_category transform
                                      ├─► audit  ──► elasticsearch_audit sink ──►
                                      ├─► spans  ──► elasticsearch_spans sink ──► https://172.31.45.110:9200
                                      └─► plain  ──► elasticsearch_plain sink ──►
                                                     TLS: http_ca.crt (from Secret)
                                                     Auth: ApiKey (from Secret)
```

---

## Components

### Single file: `deployments/vector/deploy.yaml`

Matches the single-file pattern used by `deployments/prometheus/deploy.yaml` and `deployments/grafana/deploy.yaml`.

| Resource | Kind | Purpose |
|---|---|---|
| `vector` | ServiceAccount | Identity for Vector pods in the namespace |
| `vector-cluster-role` | ClusterRole | `get/list/watch` on pods, namespaces, nodes |
| `vector-cluster-role-binding` | ClusterRoleBinding | Binds ClusterRole to ServiceAccount |
| `vector-config` | ConfigMap | Embeds the full K8s-specific `vector.yaml` |
| `vector` | DaemonSet | One Vector pod per node |

### Secret (manual, not in the file)

Sensitive credentials are kept out of version control. Create once:

```bash
kubectl create secret generic vector-es-secret \
  --from-literal=api_key="<id:api_key_value>" \
  --from-file=http_ca.crt=/path/to/http_ca.crt \
  -n english-speaking-agent
```

The `api_key` value is the raw Elasticsearch API key in `id:api_key_value` format (as returned by `POST /_security/api_keys`). Vector prepends `ApiKey ` when sending the `Authorization` header.

---

## Vector Configuration (K8s)

### Source

```yaml
sources:
  app_logs:
    type: kubernetes_logs
    self_node_name: "${VECTOR_SELF_NODE_NAME}"
    include_paths_glob_patterns:
      - "/var/log/pods/english-speaking-agent_backend-agent-*/**/*.log"
```

- `self_node_name` is injected via the Kubernetes downward API (`spec.nodeName`).
- The glob pattern restricts collection to backend pods in the `english-speaking-agent` namespace. Path format on disk: `/var/log/pods/<namespace>_<pod-name>_<pod-uid>/<container>/<instance>.log`.

### Transforms

Identical to Docker Compose (`deployments/vector/vector.yaml`):
- `extract_prefix` — parses the `YYYY-MM-DD HH:MM:SS LEVEL [logger] [file]: payload` prefix format
- `parse_payload` — attempts JSON parse of the payload; falls back to plain
- `route_by_category` — routes to `audit`, `span`, or `plain` based on fields

The `kubernetes_logs` source places the raw log line in `.message`, which is exactly what the existing transforms already read. No transform changes needed.

### Sinks

Three sinks routing to the same Elasticsearch data streams as Docker Compose, with updated connection details:

```yaml
sinks:
  elasticsearch_audit:
    type: elasticsearch
    inputs: [route_by_category.audit]
    endpoints: ["https://172.31.45.110:9200"]
    mode: data_stream
    data_stream:
      type: logs
      dataset: voice_agent.audit
      namespace: default
    tls:
      ca_file: /etc/vector/certs/http_ca.crt
    auth:
      strategy: basic
      user: ""
      password: "ApiKey ${ELASTICSEARCH_API_KEY}"
    encoding:
      except_fields: [file, host, source_type]
```

Same pattern repeated for `elasticsearch_spans` and `elasticsearch_plain`.

> **Auth note:** Vector's elasticsearch sink uses `auth.strategy: basic` with `password: "ApiKey <value>"` to produce the `Authorization: ApiKey <value>` HTTP header that Elasticsearch API key auth requires.

---

## DaemonSet Specification

### Volumes

| Volume | Type | Mount path in container | Purpose |
|---|---|---|---|
| `varlogpods` | `hostPath` (ro) | `/var/log/pods` | kubernetes_logs source reads pod stdout/stderr here |
| `vector-data` | `hostPath` | `/var/lib/vector` | Checkpoints — persists read positions across pod restarts |
| `config` | `configMap` | `/etc/vector/vector.yaml` | Vector configuration |
| `es-certs` | `secret` | `/etc/vector/certs/` | `http_ca.crt` for TLS verification |

### Environment Variables

| Name | Source |
|---|---|
| `VECTOR_SELF_NODE_NAME` | `fieldRef: spec.nodeName` (downward API) |
| `ELASTICSEARCH_API_KEY` | `secretKeyRef: vector-es-secret / api_key` |
| `VECTOR_DATA_DIR` | literal `/var/lib/vector` |

### Resource Limits

Per Vector's official agent role recommendation:

```yaml
resources:
  requests:
    cpu: "100m"
    memory: "64Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

### Security Context

```yaml
securityContext:
  allowPrivilegeEscalation: false
```

Vector reads `/var/log/pods` which requires access to host files — running as non-root is possible with correct node filesystem permissions but not enforced here to match Vector's standard agent setup.

### Tolerations

```yaml
tolerations:
  - key: "node-role.kubernetes.io/control-plane"
    operator: "Exists"
    effect: "NoSchedule"
```

Matches all other workloads in the repo. Allows scheduling on single-node or dev clusters.

### Image

`timberio/vector:0.38.0-alpine` — matches the version pinned in `docker-compose.yaml`.

---

## RBAC

Vector's `kubernetes_logs` source calls `/api/v1/pods`, `/api/v1/namespaces`, and `/api/v1/nodes` to enrich log events with metadata. A `ClusterRole` (not namespaced Role) is required because node and namespace resources are cluster-scoped.

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods", "namespaces", "nodes"]
    verbs: ["get", "list", "watch"]
```

---

## Pre-requisites Before Applying

1. Create the Elasticsearch API key on the ES server:
   ```bash
   curl -X POST "https://172.31.45.110:9200/_security/api_keys" \
     -H "Content-Type: application/json" \
     -u elastic:<password> \
     --cacert http_ca.crt \
     -d '{"name":"vector-k8s","role_descriptors":{"vector_writer":{"indices":[{"names":["logs-voice_agent.*"],"privileges":["auto_configure","create_doc"]}]}}}'
   ```
2. Copy `http_ca.crt` from the ES server (`/etc/elasticsearch/certs/http_ca.crt`).
3. Create the K8s Secret (see above).
4. Ensure the `english-speaking-agent` namespace exists (created by `backend/deploy.yaml`).

---

## Apply Order

```bash
# 1. Create secret (one-time)
kubectl create secret generic vector-es-secret \
  --from-literal=api_key="<id:value>" \
  --from-file=http_ca.crt=./http_ca.crt \
  -n english-speaking-agent

# 2. Apply manifest
kubectl apply -f deployments/vector/deploy.yaml

# 3. Verify
kubectl get pods -l app=vector -n english-speaking-agent
kubectl logs -l app=vector -n english-speaking-agent --tail=50
```

---

## Files Changed

| File | Action |
|---|---|
| `deployments/vector/deploy.yaml` | **Create** — full K8s manifest |
| `deployments/vector/vector.yaml` | **No change** — remains for Docker Compose use |

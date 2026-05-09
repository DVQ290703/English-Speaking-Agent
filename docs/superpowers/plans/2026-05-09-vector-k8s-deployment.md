# Vector K8s Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Vector as a Kubernetes DaemonSet that collects backend pod stdout logs and ships them to the external Elasticsearch server at `https://172.31.45.110:9200`.

**Architecture:** A single `deployments/vector/deploy.yaml` file contains all K8s resources: RBAC (ServiceAccount + ClusterRole + ClusterRoleBinding), ConfigMap with the K8s-specific vector config, and a DaemonSet. A separate K8s Secret (created manually, never committed) holds the Elasticsearch API key and CA certificate for TLS.

**Tech Stack:** Vector 0.38.0-alpine, Kubernetes `kubernetes_logs` source, Elasticsearch 8.13 data streams, TLS with CA cert, API key authentication.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `deployments/vector/deploy.yaml` | **Create** | All K8s resources for Vector (RBAC + ConfigMap + DaemonSet) |
| `deployments/vector/vector.yaml` | **No change** | Kept as-is for Docker Compose use |

---

## Task 1: Create `deployments/vector/deploy.yaml`

**Files:**
- Create: `deployments/vector/deploy.yaml`

- [ ] **Step 1: Write the full manifest**

Create `deployments/vector/deploy.yaml` with the following content:

```yaml
# =============================================================================
# Vector DaemonSet — English Speaking Agent
# Apply  : kubectl apply -f deployments/vector/deploy.yaml
# Status : kubectl get pods -l app=vector -n english-speaking-agent
#
# Pre-requisite secret (create once, never commit):
#   kubectl create secret generic vector-es-secret \
#     --from-literal=api_key="<id:api_key_value>" \
#     --from-file=http_ca.crt=./http_ca.crt \
#     -n english-speaking-agent
#
# Collects stdout/stderr from backend-agent pods via kubernetes_logs source.
# Routes to 3 Elasticsearch data streams: audit, spans, plain.
# Elasticsearch: https://172.31.45.110:9200 (TLS + API key auth)
# =============================================================================

# ── ServiceAccount ────────────────────────────────────────────────────────────
apiVersion: v1
kind: ServiceAccount
metadata:
  name: vector
  namespace: english-speaking-agent
  labels:
    app: vector
    tier: monitoring
    project: english-speaking-agent

---

# ── ClusterRole ───────────────────────────────────────────────────────────────
# kubernetes_logs source calls /api/v1/pods, /api/v1/namespaces, /api/v1/nodes
# to enrich log events with K8s metadata. ClusterRole (not Role) is required
# because nodes and namespaces are cluster-scoped resources.
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: vector-cluster-role
  labels:
    app: vector
    tier: monitoring
    project: english-speaking-agent
rules:
  - apiGroups: [""]
    resources: ["pods", "namespaces", "nodes"]
    verbs: ["get", "list", "watch"]

---

# ── ClusterRoleBinding ────────────────────────────────────────────────────────
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: vector-cluster-role-binding
  labels:
    app: vector
    tier: monitoring
    project: english-speaking-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: vector-cluster-role
subjects:
  - kind: ServiceAccount
    name: vector
    namespace: english-speaking-agent

---

# ── ConfigMap — vector config ─────────────────────────────────────────────────
# K8s-specific config. The Docker Compose version (deployments/vector/vector.yaml)
# is kept unchanged and continues to use the file source + local ES endpoint.
apiVersion: v1
kind: ConfigMap
metadata:
  name: vector-config
  namespace: english-speaking-agent
  labels:
    app: vector
    tier: monitoring
    project: english-speaking-agent
data:
  vector.yaml: |
    data_dir: ${VECTOR_DATA_DIR:-/var/lib/vector}

    sources:
      app_logs:
        type: kubernetes_logs
        self_node_name: "${VECTOR_SELF_NODE_NAME}"
        # Filter to backend pods in this namespace only.
        # Path pattern on node: /var/log/pods/<namespace>_<pod-name>_<pod-uid>/<container>/<n>.log
        include_paths_glob_patterns:
          - "/var/log/pods/english-speaking-agent_backend-agent-*/**/*.log"

    transforms:
      extract_prefix:
        type: remap
        inputs:
          - app_logs
        source: |
          parsed, err = parse_regex(.message, r'^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (?P<level>\S+)\s+\[(?P<logger>[^\]]+)\] \[(?P<python_file>[^\]]+)\]:\s+(?P<payload>.+)$')
          if err == null {
            ts, ts_err = parse_timestamp(parsed.ts, "%Y-%m-%d %H:%M:%S")
            if ts_err == null {
              .@timestamp = ts
            }
            .level = parsed.level
            .logger = parsed.logger
            .python_file = parsed.python_file
            .payload = parsed.payload
          } else {
            .payload = .message
          }

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
              .log_type = "span"
            } else {
              .parse_error = true
              .log_type = "plain"
            }
            if exists(.timestamp) {
              ts, ts_err = parse_timestamp(.timestamp, "%+")
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

      route_by_category:
        type: route
        inputs:
          - parse_payload
        route:
          audit: exists(.event_type)
          span: .log_type == "span" && !exists(.event_type)
          plain: .log_type == "plain"

    sinks:
      elasticsearch_audit:
        type: elasticsearch
        inputs:
          - route_by_category.audit
        endpoints:
          - https://172.31.45.110:9200
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
          except_fields:
            - file
            - host
            - source_type

      elasticsearch_spans:
        type: elasticsearch
        inputs:
          - route_by_category.span
        endpoints:
          - https://172.31.45.110:9200
        mode: data_stream
        data_stream:
          type: logs
          dataset: voice_agent.spans
          namespace: default
        tls:
          ca_file: /etc/vector/certs/http_ca.crt
        auth:
          strategy: basic
          user: ""
          password: "ApiKey ${ELASTICSEARCH_API_KEY}"
        encoding:
          except_fields:
            - file
            - host
            - source_type

      elasticsearch_plain:
        type: elasticsearch
        inputs:
          - route_by_category.plain
        endpoints:
          - https://172.31.45.110:9200
        mode: data_stream
        data_stream:
          type: logs
          dataset: voice_agent.plain
          namespace: default
        tls:
          ca_file: /etc/vector/certs/http_ca.crt
        auth:
          strategy: basic
          user: ""
          password: "ApiKey ${ELASTICSEARCH_API_KEY}"
        encoding:
          except_fields:
            - file
            - host
            - source_type

---

# ── DaemonSet ─────────────────────────────────────────────────────────────────
# One Vector pod per node. Mounts /var/log/pods (read-only) to access pod
# stdout/stderr logs written by the container runtime.
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: vector
  namespace: english-speaking-agent
  labels:
    app: vector
    tier: monitoring
    project: english-speaking-agent
spec:
  selector:
    matchLabels:
      app: vector
      tier: monitoring

  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1

  template:
    metadata:
      labels:
        app: vector
        tier: monitoring
        project: english-speaking-agent
    spec:
      serviceAccountName: vector

      # Allow scheduling on control-plane nodes (single-node/dev clusters).
      tolerations:
        - key: "node-role.kubernetes.io/control-plane"
          operator: "Exists"
          effect: "NoSchedule"

      containers:
        - name: vector
          image: timberio/vector:0.38.0-alpine
          args:
            - "--config"
            - "/etc/vector/vector.yaml"

          env:
            # Injected via downward API so kubernetes_logs knows which node it's on.
            - name: VECTOR_SELF_NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            # ES API key — value format: "id:api_key_value" (raw, no base64 needed here;
            # Vector builds the Authorization header as "ApiKey <value>" using the
            # auth.password field in the sink config).
            - name: ELASTICSEARCH_API_KEY
              valueFrom:
                secretKeyRef:
                  name: vector-es-secret
                  key: api_key
            - name: VECTOR_DATA_DIR
              value: /var/lib/vector

          volumeMounts:
            # Host pod log directory — read-only, kubernetes_logs source reads here.
            - name: varlogpods
              mountPath: /var/log/pods
              readOnly: true
            # Persistent checkpoint storage — survives pod restarts so Vector
            # resumes reading from where it left off.
            - name: vector-data
              mountPath: /var/lib/vector
            # Vector config from ConfigMap.
            - name: config
              mountPath: /etc/vector/vector.yaml
              subPath: vector.yaml
            # ES CA certificate for TLS verification.
            - name: es-certs
              mountPath: /etc/vector/certs
              readOnly: true

          resources:
            requests:
              cpu: "100m"
              memory: "64Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"

          securityContext:
            allowPrivilegeEscalation: false

      volumes:
        - name: varlogpods
          hostPath:
            path: /var/log/pods
            type: Directory
        # DirectoryOrCreate: creates /var/lib/vector on the node if absent.
        - name: vector-data
          hostPath:
            path: /var/lib/vector
            type: DirectoryOrCreate
        - name: config
          configMap:
            name: vector-config
        - name: es-certs
          secret:
            secretName: vector-es-secret
            items:
              - key: http_ca.crt
                path: http_ca.crt
```

- [ ] **Step 2: Commit the manifest**

```bash
git add deployments/vector/deploy.yaml
git commit -m "feat(k8s): add Vector DaemonSet manifest with RBAC, ConfigMap, and ES sink"
```

---

## Task 2: Dry-run validate the manifest

**Files:**
- Read: `deployments/vector/deploy.yaml`

- [ ] **Step 1: Run dry-run against the cluster**

```bash
kubectl apply --dry-run=client -f deployments/vector/deploy.yaml
```

Expected output (one line per resource):
```
serviceaccount/vector created (dry run)
clusterrole.rbac.authorization.k8s.io/vector-cluster-role created (dry run)
clusterrolebinding.rbac.authorization.k8s.io/vector-cluster-role-binding created (dry run)
configmap/vector-config created (dry run)
daemonset.apps/vector created (dry run)
```

If you see any `error:` lines, fix the YAML (common issues: indentation in the ConfigMap's `vector.yaml` block, missing `---` separators) and re-run until all 5 lines show `(dry run)`.

---

## Task 3: Create Elasticsearch API key on the ES server

**Files:** none — run on the Elasticsearch server or from a machine with access.

- [ ] **Step 1: Copy `http_ca.crt` from the ES server to your local machine**

```bash
scp root@3.26.193.122:/etc/elasticsearch/certs/http_ca.crt ./http_ca.crt
```

- [ ] **Step 2: Create a scoped API key for Vector**

Run from a machine that can reach the ES server. Replace `<elastic_password>` with the elastic superuser password:

```bash
curl -X POST "https://172.31.45.110:9200/_security/api_keys" \
  -H "Content-Type: application/json" \
  -u elastic:<elastic_password> \
  --cacert ./http_ca.crt \
  -d '{
    "name": "vector-k8s",
    "role_descriptors": {
      "vector_writer": {
        "indices": [
          {
            "names": ["logs-voice_agent.*"],
            "privileges": ["auto_configure", "create_doc"]
          }
        ]
      }
    }
  }'
```

Expected response:
```json
{
  "id": "abc123",
  "name": "vector-k8s",
  "api_key": "xxxxxxxxxxxxxxxxxxx",
  "encoded": "YWJjMTIzOnl5eXl5eXl5eXl5eXl5eXl5"
}
```

- [ ] **Step 3: Record the API key value**

The value to store in the K8s Secret is `<id>:<api_key>` — the raw (not encoded) combination. From the example above:
```
abc123:xxxxxxxxxxxxxxxxxxx
```

Do NOT use the `encoded` field. Vector constructs the Authorization header itself.

---

## Task 4: Create the K8s Secret and apply the manifest

**Files:** none — kubectl commands only.

- [ ] **Step 1: Verify the `english-speaking-agent` namespace exists**

```bash
kubectl get namespace english-speaking-agent
```

Expected:
```
NAME                      STATUS   AGE
english-speaking-agent    Active   ...
```

If it doesn't exist, apply the backend manifest first:
```bash
kubectl apply -f deployments/backend/deploy.yaml
```

- [ ] **Step 2: Create the Secret**

Replace `<id:api_key_value>` with the value from Task 3 Step 3, and ensure `http_ca.crt` is in your current directory:

```bash
kubectl create secret generic vector-es-secret \
  --from-literal=api_key="<id:api_key_value>" \
  --from-file=http_ca.crt=./http_ca.crt \
  -n english-speaking-agent
```

Expected:
```
secret/vector-es-secret created
```

- [ ] **Step 3: Apply the manifest**

```bash
kubectl apply -f deployments/vector/deploy.yaml
```

Expected:
```
serviceaccount/vector created
clusterrole.rbac.authorization.k8s.io/vector-cluster-role created
clusterrolebinding.rbac.authorization.k8s.io/vector-cluster-role-binding created
configmap/vector-config created
daemonset.apps/vector created
```

- [ ] **Step 4: Wait for the DaemonSet pod to be ready**

```bash
kubectl rollout status daemonset/vector -n english-speaking-agent
```

Expected:
```
daemon set "vector" successfully rolled out
```

---

## Task 5: Verify logs are flowing to Elasticsearch

- [ ] **Step 1: Check Vector pod is running**

```bash
kubectl get pods -l app=vector -n english-speaking-agent
```

Expected (one pod per node):
```
NAME           READY   STATUS    RESTARTS   AGE
vector-xxxxx   1/1     Running   0          1m
```

- [ ] **Step 2: Check Vector logs for Elasticsearch connection errors**

```bash
kubectl logs -l app=vector -n english-speaking-agent --tail=50
```

Look for lines like:
```
INFO vector::topology: Running. component_kind="sink" component_type="elasticsearch" ...
```

If you see `ERROR` lines mentioning TLS or auth, check:
- TLS error → `http_ca.crt` in the Secret matches the cert on the ES server
- 401 Unauthorized → API key value in the Secret is wrong; recreate with `kubectl delete secret vector-es-secret -n english-speaking-agent` and redo Task 4 Step 2

- [ ] **Step 3: Verify logs appear in Elasticsearch**

From a machine with access to the ES server:

```bash
curl -s "https://172.31.45.110:9200/logs-voice_agent.plain-default/_search?size=1&pretty" \
  -u elastic:<elastic_password> \
  --cacert ./http_ca.crt \
  -H "Content-Type: application/json" \
  -d '{"sort":[{"@timestamp":{"order":"desc"}}]}'
```

Expected: a JSON response with `"hits": { "total": { "value": > 0 } }` and a document containing `log_type`, `message`, and `kubernetes.pod_name` fields.

If `total.value` is 0:
1. Check the backend pods are running and producing logs: `kubectl logs -l app=backend-agent -n english-speaking-agent --tail=5`
2. Check the glob pattern matches: `kubectl exec -it <vector-pod> -n english-speaking-agent -- ls /var/log/pods/ | grep english-speaking-agent_backend`
3. If no matching directories, the backend pod names may differ — check with `kubectl get pods -n english-speaking-agent` and adjust `include_paths_glob_patterns` in the ConfigMap accordingly.

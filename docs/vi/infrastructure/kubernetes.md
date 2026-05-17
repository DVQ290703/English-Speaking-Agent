# Hướng Dẫn Triển Khai Trên Kubernetes (Kubernetes Deployment Guide)

Toàn bộ các tệp cấu hình (manifests) Kubernetes được lưu trữ tập trung trong thư mục `deployments/`. Cụm máy chủ chạy thật (production) sử dụng dịch vụ GKE của Google Cloud; tuy nhiên, các tệp manifest này vẫn hoạt động bình thường trên bất kỳ cụm Kubernetes tiêu chuẩn nào khác.

---

## Không Gian Tên (Namespace)

Mọi tiến trình chạy (workload) đều được vận hành trong không gian tên `english-speaking-agent`. Không gian tên này được khai báo ở đầu mỗi tệp cấu hình cấu trúc và có thể áp dụng nhiều lần một cách an toàn (idempotent):

```bash
kubectl create namespace english-speaking-agent --dry-run=client -o yaml | kubectl apply -f -
```

---

## Cấu Trúc Thư Mục Deployments (Repository Layout)

```
deployments/
├── backend/
│   ├── deploy.yaml             # Không gian tên, Deployment, Service cho backend
│   └── prompts-configmap.yaml  # ConfigMap lưu trữ System-prompt (agent-prompts)
├── frontend/
│   └── deploy.yaml             # Không gian tên, Deployment, Service cho frontend
├── redis/
│   └── redis.yaml              # Deployment và Service của Redis
├── minio/
│   └── minio.yaml              # PVC, Deployment, Service cho MinIO (API + Console)
├── elasticsearch/
│   ├── deploy.yaml             # Triển khai lưu trữ nhật ký log Elasticsearch
│   └── index-template.json     # Mẫu cấu trúc index Elasticsearch
├── grafana/
│   ├── deploy.yaml             # Triển khai hiển thị dashboard Grafana
│   └── dashboard-configmap.yaml# ConfigMap nạp sẵn các dashboard mẫu
├── prometheus/
│   ├── deploy.yaml             # Triển khai bộ thu thập chỉ số Prometheus
│   └── prometheus.yml          # Cấu hình các job cào metrics
├── vector/
│   └── vector.yaml             # Triển khai bộ chuyển tiếp log Vector
└── ingress.yaml                # Cấu hình GKE Ingress, ManagedCertificate, và FrontendConfig
```

---

## Áp Dụng Các Tệp Manifests (Applying Manifests)

Khởi chạy áp dụng tất cả các tệp manifest theo đúng thứ tự phụ thuộc dưới đây để tránh lỗi liên kết:

```bash
# 1. Khởi chạy các dịch vụ lưu trữ trạng thái và ổ cứng trước (Stateful & Storage)
kubectl apply -f deployments/redis/redis.yaml
kubectl apply -f deployments/minio/minio.yaml

# 2. Triển khai hệ thống giám sát và ghi log (Observability)
kubectl apply -f deployments/elasticsearch/deploy.yaml
kubectl apply -f deployments/prometheus/deploy.yaml
kubectl apply -f deployments/grafana/deploy.yaml
kubectl apply -f deployments/vector/vector.yaml

# 3. Triển khai các ứng dụng chạy chính (Application)
kubectl apply -f deployments/backend/prompts-configmap.yaml
kubectl apply -f deployments/backend/deploy.yaml
kubectl apply -f deployments/frontend/deploy.yaml

# 4. Triển khai cấu hình định tuyến Ingress (chạy cuối cùng — khi các Service đã sẵn sàng)
kubectl apply -f deployments/ingress.yaml
```

Hoặc áp dụng đồng loạt tất cả các tệp cùng lúc (thứ tự khởi tạo sẽ do Kubernetes tự sắp xếp tối ưu):

```bash
kubectl apply -R -f deployments/
```

---

## Triển Khai Chi Tiết (Deployments)

| Tên Deployment | Số lượng replica | Ảnh Docker (Image) | Cổng chạy | Chiến lược deploy |
|---|---|---|---|---|
| `backend-agent` | 1 | `vinai-registry.duckdns.org/english-speaking-agent/backend:latest` | 8000 | Cập nhật cuốn chiếu (RollingUpdate) |
| `frontend-agent` | 1 | `vinai-registry.duckdns.org/english-speaking-agent/frontend:latest` | 80 | Cập nhật cuốn chiếu (RollingUpdate) |
| `redis` | 1 | `redis:7-alpine` | 6379 | Cập nhật cuốn chiếu (RollingUpdate) |
| `minio` | 1 | `minio/minio:latest` | 9000 / 9001 | Tạo mới hoàn toàn (Recreate - ràng buộc PVC) |
| `elasticsearch` | 1 | `elasticsearch:8.13.0` | 9200 | Cập nhật cuốn chiếu (RollingUpdate) |
| `grafana` | 1 | `grafana/grafana:10.4.0` | 3000 | Cập nhật cuốn chiếu (RollingUpdate) |
| `prometheus` | 1 | `prom/prometheus:v2.52.0` | 9090 | Cập nhật cuốn chiếu (RollingUpdate) |

Tất cả các hành động cập nhật cuốn chiếu đều được thiết lập thông số `maxSurge: 1` và `maxUnavailable: 0` (đảm bảo dịch vụ chạy liên tục không bị gián đoạn - zero-downtime).

---

## Quản Lý Các Secret

### backend-secret

Tất cả thông tin cấu hình nhạy cảm bảo mật dành cho backend (thông tin tài khoản CSDL, mã truy cập MinIO, khóa ký JWT, API keys của đối tác, cấu hình email SMTP) được lưu trữ tập trung trong một Kubernetes Secret duy nhất có tên `backend-secret`. MinIO cũng tự động đọc thông số root credentials từ secret này.

Khởi tạo secret một lần duy nhất trước đợt deploy đầu tiên:

```bash
kubectl create secret generic backend-secret \
  --from-env-file=.env.prod \
  -n english-speaking-agent
```

Cập nhật giá trị một khóa riêng lẻ mà không cần khởi tạo lại toàn bộ Secret:

```bash
kubectl patch secret backend-secret \
  -n english-speaking-agent \
  --type='json' \
  -p='[{"op":"replace","path":"/data/GROQ_API_KEY","value":"'$(echo -n "new-key" | base64)'"}]'
```

### harbor-registry-secret

Mã khóa dùng để tải ảnh Docker (image pull secret) từ registry private Harbor. Được tạo tự động bởi pipeline CI/CD ở mỗi đợt deploy (idempotent):

```bash
kubectl create secret docker-registry harbor-registry-secret \
  --docker-server=vinai-registry.duckdns.org \
  --docker-username=<HARBOR_USER> \
  --docker-password=<HARBOR_PASSWORD> \
  -n english-speaking-agent
```

---

## Bản Đồ Cấu Hình (ConfigMaps)

### agent-prompts

Lưu trữ tệp văn bản Markdown định nghĩa prompt hệ thống (system prompt) cho AI agent. Tệp này được gắn kết (mount) trực tiếp vào container backend tại đường dẫn `/app/app/prompts/system_prompt.md`, cho phép cập nhật prompt hệ thống ngay lập tức mà không cần đóng gói (build) lại ảnh Docker.

```bash
# Áp dụng tệp cập nhật prompt hệ thống mới
kubectl apply -f deployments/backend/prompts-configmap.yaml

# Khởi động lại cuốn chiếu để backend nạp cấu hình ConfigMap mới ngay lập tức
kubectl rollout restart deployment/backend-agent -n english-speaking-agent
```

---

## Hạn Mức Tài Nguyên Backend (Backend Resource Limits)

Được định nghĩa chi tiết trong tệp `deployments/backend/deploy.yaml`:

| Loại hạn mức | CPU | Bộ nhớ (Memory) |
|---|---|---|
| Yêu cầu tối thiểu (Request) | `100m` | `128Mi` |
| Hạn mức tối đa (Limit) | `500m` | `512Mi` |

Các bài kiểm tra sức khỏe (Health probes):

| Loại Probe | Đường dẫn kiểm tra | Độ trễ ban đầu | Chu kỳ kiểm tra |
|---|---|---|---|
| Sẵn sàng phục vụ (Readiness) | `GET /health` | 10 s | 10 s |
| Sống sót (Liveness) | `GET /health` | 20 s | 20 s |

Cả hai bài kiểm tra trên đều có thông số ngưỡng lỗi tối đa `failureThreshold: 3`.

---

## Định Tuyến Ingress (Ingress Routing)

Tệp cấu hình `deployments/ingress.yaml` sẽ khởi tạo một bộ cân bằng tải GKE HTTP(S) Load Balancer (`kubernetes.io/ingress.class: gce`) đi kèm với chứng chỉ bảo mật TLS tự động quản lý bởi GCP dành cho tên miền `a20-app-014.duckdns.org`. Lưu lượng truy cập HTTP sẽ được tự động chuyển hướng vĩnh viễn (redirect 301) sang HTTPS thông qua cấu hình `FrontendConfig`.

| Đường dẫn định tuyến | Service xử lý ở Backend | Cổng xử lý | Ghi chú |
|---|---|---|---|
| `/api/*` | `backend-agent-service` | 8000 | FastAPI — bắt buộc phải khai báo định tuyến trước mẫu `/*` |
| `/storage/*` | `minio-service` | 9000 | Đường dẫn truy cập công khai cho các liên kết pre-signed của MinIO |
| `/grafana/*` | `grafana-service` | 3000 | Bảng hiển thị thông số giám sát hệ thống |
| `/*` | `frontend-agent-service` | 80 | Định tuyến bắt lấy mọi lưu lượng khác cho React SPA |

Các bước xử lý sau khi áp dụng tệp ingress:
1. Lấy địa chỉ IP được hệ thống cấp phát: chạy lệnh `kubectl get ingress vinai-ingress -n english-speaking-agent`
2. Tiến hành trỏ tên miền `a20-app-014.duckdns.org` về địa chỉ IP vừa nhận được trên DuckDNS.
3. Chờ khoảng 15-20 phút để Google Cloud tiến hành xác thực tên miền và kích hoạt chứng chỉ bảo mật TLS.

---

## Các Câu Lệnh kubectl Hữu Ích

```bash
# Theo dõi thời gian thực trạng thái các Pod trong không gian tên
kubectl get pods -n english-speaking-agent -w

# Xem thông tin chi tiết của Pod bị lỗi (lịch sử sự kiện, lỗi probe sức khỏe)
kubectl describe pod <tên-pod> -n english-speaking-agent

# Xem trực tiếp nhật ký log của dịch vụ backend
kubectl logs -f deployment/backend-agent -n english-speaking-agent

# Mở cửa sổ dòng lệnh bash tương tác trực tiếp bên trong container backend
kubectl exec -it deployment/backend-agent -n english-speaking-agent -- bash

# Kiểm tra trạng thái tiến trình deploy/cập nhật cuốn chiếu
kubectl rollout status deployment/backend-agent -n english-speaking-agent

# Quay xe hoàn tác (roll back) phiên bản deploy bị lỗi về phiên bản gần nhất trước đó
kubectl rollout undo deployment/backend-agent -n english-speaking-agent

# Xem danh sách tất cả các Service đang chạy
kubectl get svc -n english-speaking-agent

# Xem thông tin cấu hình Ingress và địa chỉ IP được cấp phát tương ứng
kubectl describe ingress vinai-ingress -n english-speaking-agent

# Kiểm tra trạng thái xác thực chứng chỉ TLS tự quản lý
kubectl describe managedcertificate vinai-managed-cert -n english-speaking-agent

# Giải mã base64 xem giá trị mật khẩu cơ sở dữ liệu được lưu trong Secret
kubectl get secret backend-secret -n english-speaking-agent \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 --decode
```

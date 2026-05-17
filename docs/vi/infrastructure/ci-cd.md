# Hướng Dẫn CI/CD (CI/CD Guide)

Dự án sử dụng hai hệ thống tích hợp liên tục (CI) hoạt động song song để quản lý mã nguồn:

| Hệ thống | Tệp cấu hình | Nhiệm vụ đảm nhận |
|---|---|---|
| **GitLab CI** | `.gitlab-ci.yml` | Tự động đóng gói ảnh Docker bằng Kaniko và triển khai ứng dụng lên cụm Kubernetes GKE |
| **GitHub Actions** | `.github/workflows/test.yml` | Khởi chạy bộ kiểm thử tự động pytest sau mỗi lượt push hoặc Pull Request |

---

## Pipeline GitLab CI

### Các Giai Đoạn Triển Khai (Stages)

```
build (đóng gói)  →  deploy (triển khai)
```

Giai đoạn kiểm thử `test` được định nghĩa sẵn trong tệp cấu hình nhưng hiện tại đang được comment lại (vô hiệu hóa); toàn bộ quá trình kiểm thử tự động hiện được ủy thác trực tiếp cho GitHub Actions. Khi bỏ comment, giai đoạn này sẽ hoạt động như một chốt chặn kiểm soát bắt buộc trước khi tiến hành đóng gói (build) và triển khai (deploy).

| Giai đoạn | Job thực thi | Điều kiện kích hoạt (Trigger) |
|---|---|---|
| `build` | `build-backend` | Thực hiện push lên nhánh `main` khi có thay đổi trong `app/**/*`, `Dockerfile`, hoặc `requirements.txt` |
| `build` | `build-frontend` | Thực hiện push lên nhánh `main` khi có thay đổi trong `frontend/**/*` hoặc `Dockerfile.frontend` |
| `deploy` | `deploy-backend` | Khởi chạy sau khi job `build-backend` hoàn thành thành công (cùng bộ lọc đường dẫn thay đổi) |
| `deploy` | `deploy-backend-manifest` | Thực hiện push lên nhánh `main` khi có thay đổi trong `deployments/backend/**/*` (triển khai nhanh không cần đóng gói lại ảnh Docker) |
| `deploy` | `deploy-frontend` | Khởi chạy sau khi job `build-frontend` hoàn thành thành công (cùng bộ lọc đường dẫn thay đổi) |
| `deploy` | `deploy-frontend-manifest` | Thực hiện push lên nhánh `main` khi có thay đổi trong `deployments/frontend/**/*` (triển khai nhanh không cần đóng gói lại ảnh Docker) |
| `deploy` | `deploy-ingress` | Thực hiện push lên nhánh `main` khi tệp cấu hình định tuyến `deployments/ingress.yaml` có thay đổi |

Tất cả các job trên đều được cấu hình để chạy trên runner có nhãn (tag) `AWS-Gitlab-runner`.

---

### Đóng Gói Ảnh Docker Bằng Kaniko

Các job build ảnh Docker sử dụng trực tiếp công cụ `gcr.io/kaniko-project/executor:v1.23.2-debug` (không yêu cầu dịch vụ Docker daemon chạy ngầm). Trước khi tiến hành build, một anchor YAML (`kaniko_auth`) sẽ tự động ghi nhận thông tin tài khoản đăng nhập registry Harbor vào tệp cấu hình `/kaniko/.docker/config.json`.

Nhãn (tag) của ảnh Docker được tạo tự động theo định dạng `<DATE>-<CI_COMMIT_SHORT_SHA>` (ví dụ: `20260516-abc1234`). Nhãn `latest` cũng được đẩy lên song song sau mỗi lượt build. Tính năng lưu bộ nhớ đệm phân lớp (layer caching) được kích hoạt qua tùy chọn `--cache-repo`.

```
# Địa chỉ đích lưu trữ ảnh Docker của Backend
vinai-registry.duckdns.org/english-speaking-agent/backend:<DATE>-<SHA>
vinai-registry.duckdns.org/english-speaking-agent/backend:latest

# Địa chỉ đích lưu trữ ảnh Docker của Frontend
vinai-registry.duckdns.org/english-speaking-agent/frontend:<DATE>-<SHA>
vinai-registry.duckdns.org/english-speaking-agent/frontend:latest

# Kho lưu trữ bộ nhớ đệm của quá trình build
vinai-registry.duckdns.org/english-speaking-agent/cache
```

---

### Triển Khai Lên GCP / GKE (GCP / GKE Deploy)

Các job triển khai sử dụng image `google/cloud-sdk:alpine`. Cơ chế xác thực bảo mật sử dụng giải pháp **GCP Workload Identity Federation (WIF)** — hoàn toàn không lưu trữ khóa tài khoản dịch vụ (Service Account Key) dạng tĩnh trong hệ thống. Quy trình hoạt động cụ thể như sau:

1. Ghi mã OIDC token `CI_JOB_JWT_V2` được GitLab định nghĩa sẵn vào tệp tạm `/tmp/gitlab-token.txt`.
2. Khởi tạo tệp cấu hình xác thực WIF JSON tham chiếu đến tệp chứa token trên và URL giả mạo tài khoản dịch vụ (SA impersonation).
3. Đăng nhập qua lệnh: `gcloud auth login --cred-file=/tmp/wif-cred.json`.
4. Gọi lệnh `gcloud container clusters get-credentials` để cấu hình tệp ngữ cảnh cho công cụ `kubectl`.
5. Các tệp chứa khóa xác thực tạm thời sẽ được xóa ngay lập tức sau khi xác thực thành công.

Các bước triển khai Kubernetes thực tế (Ví dụ đối với dịch vụ Backend):

```bash
kubectl apply -f deployments/backend/prompts-configmap.yaml
kubectl apply -f deployments/backend/deploy.yaml
kubectl set image deployment/backend-agent backend=<VERSION_TAG> -n english-speaking-agent
kubectl rollout status deployment/backend-agent -n english-speaking-agent --timeout=300s
```

---

### Các Biến Môi Trường GitLab CI Yêu Cầu

Cấu hình các biến môi trường này trong mục **Settings → CI/CD → Variables** trên dự án GitLab của bạn. Đánh dấu **Masked** đối với các khóa/mật khẩu nhạy cảm để ẩn thông tin trong log build.

| Biến môi trường | Ẩn (Masked) | Mô tả chi tiết |
|---|---|---|
| `HARBOR_USER` | Không | Tên tài khoản đăng nhập registry Harbor |
| `HARBOR_PASSWORD` | Có | Mật khẩu truy cập registry Harbor |
| `GCP_PROJECT_ID` | Không | Mã định danh dự án GCP (ví dụ: `vinuniai`) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Không | Tên tài nguyên nhà cung cấp WIF đầy đủ dạng: `projects/<NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>` |
| `GCP_SERVICE_ACCOUNT` | Không | Địa chỉ email tài khoản dịch vụ của GCP (ví dụ: `gitlab-deployer@vinuniai.iam.gserviceaccount.com`) |
| `GKE_CLUSTER_NAME` | Không | Tên của cụm Kubernetes GKE (ví dụ: `vinai-cluster`) |
| `GKE_CLUSTER_ZONE` | Không | Vùng khu vực địa lý của cụm GKE (ví dụ: `us-central1-a`) |

Các biến môi trường dưới đây được khai báo tĩnh trực tiếp trong tệp cấu hình `.gitlab-ci.yml` (không yêu cầu thiết lập trên giao diện GitLab UI):

| Biến môi trường | Giá trị cấu hình |
|---|---|
| `HARBOR_REGISTRY` | `vinai-registry.duckdns.org` |
| `HARBOR_PROJECT` | `english-speaking-agent` |
| `IMAGE_BACKEND` | `vinai-registry.duckdns.org/english-speaking-agent/backend` |
| `IMAGE_FRONTEND` | `vinai-registry.duckdns.org/english-speaking-agent/frontend` |
| `CACHE_REPO` | `vinai-registry.duckdns.org/english-speaking-agent/cache` |
| `K8S_NAMESPACE` | `english-speaking-agent` |

> **Lưu ý:** `CI_JOB_JWT_V2` là một biến được GitLab định nghĩa sẵn (hỗ trợ từ phiên bản GitLab 14.9 trở lên). Nếu biến này bị rỗng, hãy kích hoạt nó trong phần **Admin → Settings → Network → Token Access** trên máy chủ GitLab của bạn.

---

## Luồng Kiểm Thử Tự Động Qua GitHub Actions

Tệp cấu hình: `.github/workflows/test.yml`

### Điều kiện kích hoạt (Triggers)

- Thực hiện **Push** mã nguồn lên nhánh `main` hoặc `develop`
- Tạo các yêu cầu **Pull Request** nhắm tới nhánh `main`

### Job thực thi: `pytest · Python 3.10`

Được chạy trên môi trường máy ảo `ubuntu-latest`.

| Bước thực hiện | Hành động cụ thể |
|---|---|
| Tải mã nguồn về (Checkout) | Sử dụng action `actions/checkout@v4` |
| Thiết lập Python 3.10 | Sử dụng action `actions/setup-python@v5` |
| Cài đặt công cụ `uv` | Chạy lệnh `pip install uv` để cài đặt nhanh |
| Cài đặt các thư viện chạy thật | Chạy lệnh `uv pip install -r requirements.txt --system` |
| Cài đặt các thư viện phục vụ kiểm thử | Chạy lệnh `uv pip install -r requirements-test.txt --system` |
| Chạy bộ kiểm thử tự động | Khởi chạy lệnh `python -m pytest tests/ --tb=short` |
| Tải lên báo cáo độ bao phủ (tùy chọn) | Chạy lệnh `pytest --cov=app --cov-report=xml` (luôn khởi chạy, nếu lỗi không làm dừng luồng chính) |

### Các Biến Môi Trường Được Tiêm Trong Quá Trình Chạy

| Biến môi trường | Giá trị cấu hình | Lý do sử dụng |
|---|---|---|
| `JWT_SECRET_KEY` | `ci-test-secret-key-for-github-ci!` | Độ dài tối thiểu phải từ 32 bytes trở lên để kiểm tra chữ ký token JWT; các giá trị mặc định kiểm thử khác được cấu hình trong `conftest.py` |

Không yêu cầu thêm bất kỳ mã khóa bảo mật thực tế nào khác — bộ kiểm thử tự động sử dụng cơ chế giả lập trong bộ nhớ (in-memory mocks) cho tất cả các dịch vụ bên ngoài (như database, Redis, MinIO, và các API đối tác).

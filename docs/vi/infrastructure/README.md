# Tổng Quan Về Hạ Tầng (Infrastructure Overview)

Ứng dụng được vận hành dưới dạng một tập hợp các dịch vụ được container hóa (đóng gói trong các container Docker). Hệ thống hỗ trợ hai môi trường triển khai chính:

| Môi trường | Công cụ sử dụng | Tài liệu hướng dẫn |
|---|---|---|
| Phát triển ở local | Docker Compose | [local-development.md](./local-development.md) |
| Điện toán đám mây (GCP / AWS) | Kubernetes + Terraform | [kubernetes.md](./kubernetes.md), [terraform.md](./terraform.md) |

Tài liệu hướng dẫn CI/CD được trình bày chi tiết tại [ci-cd.md](./ci-cd.md).

---

## Sơ Đồ Các Dịch Vụ (Services Map)

```
                         ┌─────────────────────────────────────────────────────────────┐
                         │                    Docker Compose / Kubernetes               │
                         │                                                               │
  Trình duyệt / Client ──┼──► frontend :3000 (nginx)                                   │
                         │         │                                                     │
                         │         │ /api/*  proxy                                       │
                         │         ▼                                                     │
                         │    backend :8000 (FastAPI / uvicorn)                         │
                         │         │                                                     │
                         │    ┌────┼─────────────────────────────┐                      │
                         │    │    │                             │                      │
                         │    ▼    ▼                             ▼                      │
                         │ postgres:5432  redis:6379       minio:9000/9001              │
                         │ (PostgreSQL 16) (Redis 7)        (Lưu trữ đối tượng)         │
                         │    │                                                          │
                         │    └── pgadmin:5050 (Giao diện quản trị CSDL)                 │
                         │                                                               │
                         │  ── Hệ thống Giám sát & Theo dõi ─────────────────────────── │
                         │                                                               │
                         │  vector (thu thập log) ──► elasticsearch:9200                 │
                         │                               │                              │
                         │                           kibana:5601 (giao diện xem log)    │
                         │                                                               │
                         │  backend (chỉ số) ──► prometheus:9090 ──► grafana:3001        │
                         │                                                               │
                         └─────────────────────────────────────────────────────────────┘

  Các API bên ngoài do backend gọi:
    ┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐  ┌────────────┐
    │  Groq (LLM)    │  │  ElevenLabs TTS │  │  Azure Speech STT  │  │  Resend    │
    │  (HTTPS/443)   │  │  (HTTPS/443)    │  │  (HTTPS/443)       │  │  (email)   │
    └────────────────┘  └─────────────────┘  └────────────────────┘  └────────────┘
```

---

## Hệ Thống Giám Sát (Monitoring)

Hệ thống giám sát (observability stack) bao gồm bốn thành phần chính, tất cả đều được cấu hình và định nghĩa trong thư mục `deployments/`:

| Thành phần | Hình ảnh (Image) | Vai trò nhiệm vụ |
|---|---|---|
| **Prometheus** `v2.52.0` | `prom/prometheus` | Tự động thu thập chỉ số (metrics) từ backend và lưu trữ dữ liệu chuỗi thời gian với thời gian lưu giữ mặc định là 30 ngày. Tệp cấu hình nằm tại `deployments/prometheus/prometheus.yml`. |
| **Grafana** `10.4.0` | `grafana/grafana` | Hiển thị các bảng biểu trực quan (dashboards) được nạp từ thư mục `deployments/grafana/provisioning/`. Có thể truy cập tại cổng `:3001` (local) hoặc qua đường dẫn `/grafana/*` (trên cloud). |
| **Vector** `0.38.0` | `timberio/vector:0.38.0-alpine` | Theo dõi (tail) các tệp log có cấu trúc từ thư mục `./logs/`, phân tích cú pháp và chuyển dữ liệu trực tiếp tới Elasticsearch. Tệp cấu hình nằm tại `deployments/vector/vector.yaml`. |
| **Elasticsearch** `8.13.0` | `docker.elastic.co/elasticsearch/elasticsearch` | Lưu trữ tập trung toàn bộ nhật ký hệ thống (logs) ở dạng node đơn, tắt tính năng bảo mật để thuận tiện sử dụng ở môi trường local. Một init container sẽ tự động tạo các chính sách ILM, các mẫu thành phần và mẫu chỉ mục (index templates) khi khởi động lần đầu. |
| **Kibana** `8.13.0` | `docker.elastic.co/kibana/kibana` | Giao diện khám phá nhật ký hệ thống trực quan tại cổng `:5601`. Một init container sẽ tự động tạo sẵn ba chế độ xem dữ liệu (data views) bao gồm: `Voice Agent - Spans`, `Voice Agent - Audit`, và `Voice Agent - Plain`. |

---

## Các Biến Môi Trường Quan Trọng (Key Environment Variables)

Dịch vụ backend yêu cầu cấu hình các biến môi trường sau. Các giá trị cấu hình tĩnh được định nghĩa và tiêm trực tiếp thông qua tệp `docker-compose.yaml`; đối với các thông tin nhạy cảm bảo mật (secrets) bắt buộc phải được khai báo trong tệp `.env`.

### Được định nghĩa sẵn trong tệp `docker-compose.yaml` (không cần khai báo trong `.env`)

| Biến môi trường | Giá trị mặc định | Mô tả chi tiết |
|---|---|---|
| `POSTGRES_HOST` | `postgres` | Tên DNS nội bộ trong mạng Docker để backend kết nối tới container CSDL |
| `POSTGRES_PORT` | `5432` | Cổng dịch vụ mặc định của PostgreSQL |
| `MINIO_ENDPOINT` | `minio:9000` | Endpoint kết nối nội bộ đến dịch vụ lưu trữ đối tượng MinIO tương thích S3 |
| `REDIS_URL` | `redis://redis:6379/0` | Đường dẫn URI kết nối tới dịch vụ lưu cache và session trên Redis |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Danh sách các địa chỉ nguồn gốc được phép truy cập CORS trong môi trường phát triển local |
| `TZ` | `Asia/Ho_Chi_Minh` | Thiết lập múi giờ chạy trong container |

### Yêu cầu bắt buộc khai báo trong tệp `.env` (chứa các mã khóa bảo mật và cấu hình môi trường)

| Biến môi trường | Sử dụng bởi | Mô tả chi tiết |
|---|---|---|
| `POSTGRES_DB` | postgres, backend | Tên cơ sở dữ liệu chính |
| `POSTGRES_USER` | postgres, backend | Tên tài khoản quản trị cơ sở dữ liệu |
| `POSTGRES_PASSWORD` | postgres, backend | Mật khẩu truy cập cơ sở dữ liệu |
| `PGADMIN_DEFAULT_EMAIL` | pgadmin | Email tài khoản đăng nhập quản trị cơ sở dữ liệu qua giao diện pgAdmin |
| `PGADMIN_DEFAULT_PASSWORD` | pgadmin | Mật khẩu tài khoản đăng nhập pgAdmin |
| `MINIO_ROOT_USER` | minio | Khóa truy cập root (Access Key) của MinIO |
| `MINIO_ROOT_PASSWORD` | minio | Khóa bí mật root (Secret Key) của MinIO |
| `GRAFANA_ADMIN_PASSWORD` | grafana | Mật khẩu đăng nhập quản trị hệ thống Grafana (mặc định là `admin`) |
| `JWT_SECRET_KEY` | backend | Khóa bí mật dùng để mã hóa và xác thực chữ ký của JWT token |
| `GROQ_API_KEY` | backend | Khóa API để gọi dịch vụ mô hình ngôn ngữ lớn (LLM) của Groq |
| `ELEVENLABS_API_KEY` | backend | Khóa API gọi dịch vụ chuyển văn bản thành giọng nói (TTS) ElevenLabs |
| `AZURE_SPEECH_KEY` | backend | Khóa API gọi dịch vụ chấm điểm phát âm Azure Cognitive Services Speech |
| `AZURE_SPEECH_REGION` | backend | Vùng khu vực (region) cấu hình của dịch vụ Azure Speech |
| `RESEND_API_KEY` | backend | Khóa API gửi email giao dịch, khôi phục mật khẩu thông qua dịch vụ Resend |

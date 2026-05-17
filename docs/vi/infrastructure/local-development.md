# Hướng Dẫn Phát Triển Tại Môi Trường Local (Local Development Guide)

Tài liệu này hướng dẫn chi tiết cách khởi chạy toàn bộ hệ thống dịch vụ của ứng dụng (application stack) ngay tại máy tính cá nhân (local) sử dụng công cụ Docker Compose.

---

## Các Yêu Cầu Tiên Quyết (Prerequisites)

- **Docker Desktop** phiên bản 4.x trở lên (đã bao gồm sẵn Docker Engine và công cụ Docker Compose v2)
- **Git** cài đặt trên máy để thực hiện nhân bản (clone) kho lưu trữ mã nguồn dự án
- Một tệp cấu hình môi trường `.env` đặt tại thư mục gốc của dự án (xem hướng dẫn chi tiết bên dưới)

---

## Biến Môi Trường (Environment Variables)

Hãy khởi tạo một tệp tin `.env` tại thư mục gốc của dự án trước khi chạy lệnh `docker compose up` lần đầu tiên. Các biến môi trường sau đây là bắt buộc phải khai báo cấu hình:

```dotenv
# Cấu hình PostgreSQL
POSTGRES_DB=voice_agent
POSTGRES_USER=voice_agent_user
POSTGRES_PASSWORD=changeme

# Cấu hình pgAdmin (Giao diện quản lý CSDL)
PGADMIN_DEFAULT_EMAIL=admin@example.com
PGADMIN_DEFAULT_PASSWORD=changeme

# Cấu hình MinIO (Lưu trữ đối tượng)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=changeme

# Cấu hình Grafana (Tùy chọn — mặc định sẽ dùng "admin" nếu bỏ qua)
GRAFANA_ADMIN_PASSWORD=admin

# Khóa JWT
JWT_SECRET_KEY=a-secret-key-at-least-32-chars-long!

# Các khóa API bên ngoài gọi dịch vụ đối tác
GROQ_API_KEY=gsk_...
ELEVENLABS_API_KEY=...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
RESEND_API_KEY=re_...
```

Dịch vụ backend cũng tự động nhận một số giá trị cấu hình tĩnh được tiêm trực tiếp từ tệp `docker-compose.yaml` (bạn không cần phải khai báo thêm trong `.env`):

| Biến môi trường | Giá trị cấu hình tĩnh |
|---|---|
| `POSTGRES_HOST` | `postgres` |
| `POSTGRES_PORT` | `5432` |
| `MINIO_ENDPOINT` | `minio:9000` |
| `REDIS_URL` | `redis://redis:6379/0` |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173` |
| `TZ` | `Asia/Ho_Chi_Minh` |

---

## Khởi Chạy Hệ Thống (Starting the Stack)

Tự động xây dựng (build) lại tất cả các ảnh Docker (images) và khởi chạy mọi dịch vụ ở chế độ chạy ngầm (background):

```bash
docker compose up --build -d
```

Để chỉ khởi chạy các dịch vụ cốt lõi chạy ứng dụng chính (bao gồm backend + các dịch vụ phụ thuộc trực tiếp, lược bỏ hệ thống giám sát log và metrics):

```bash
docker compose up --build -d backend frontend postgres redis minio pgadmin
```

Để theo dõi nhật ký log thời gian thực của tất cả các container đang chạy đồng thời:

```bash
docker compose logs -f
```

---

## Các Cổng Dịch Vụ Cung Cấp (Service Ports)

Sau khi hệ thống dịch vụ khởi chạy thành công, các cổng kết nối và địa chỉ URL tương ứng dưới đây sẽ sẵn sàng truy cập trực tiếp tại máy host (`localhost`):

| Tên Dịch vụ | Cổng chạy | Địa chỉ URL truy cập |
|---|---|---|
| Frontend (nginx) | `3000` | http://localhost:3000 |
| Backend (FastAPI) | `8000` | http://localhost:8000/docs |
| PostgreSQL | `5432` | Chạy dòng lệnh kết nối: `psql -h localhost -U <POSTGRES_USER> -d <POSTGRES_DB>` |
| pgAdmin | `5050` | http://localhost:5050 |
| Redis | `6379` | Chạy dòng lệnh kết nối: `redis-cli -h localhost` |
| MinIO API | `9000` | http://localhost:9000 |
| MinIO Console | `9001` | http://localhost:9001 |
| Elasticsearch | `9200` | http://localhost:9200 |
| Kibana | `5601` | http://localhost:5601 |
| Prometheus | `9090` | http://localhost:9090 |
| Grafana | `3001` | http://localhost:3001 |

---

## Ảnh Docker Của Backend (Backend Image)

Dịch vụ backend được xây dựng thông qua một tệp `Dockerfile` thiết kế tối ưu hóa theo mô hình hai giai đoạn (two-stage build):

- **Giai đoạn 1 (`builder`)** — khởi tạo từ base image `python:3.10-slim`. Thực hiện cài đặt các thư viện hệ thống cần thiết gồm `gcc`, `build-essential`, và `libffi-dev`, tạo một môi trường ảo python virtualenv tại thư mục `/venv`, sau đó cài đặt các thư viện Python yêu cầu từ tệp `requirements.txt`.
- **Giai đoạn 2 (runtime)** — chỉ sao chép môi trường ảo `/venv` tối giản và mã nguồn ứng dụng chạy thật từ giai đoạn 1 sang, vận hành dưới quyền của người dùng bảo mật không có quyền root tên là `app`.

---

## Nạp Dữ Liệu Mẫu (Database Seeding)

Cơ sở dữ liệu sẽ tự động được khởi tạo cấu trúc và nạp dữ liệu mẫu (seed) trong lần khởi động đầu tiên. Docker Compose sẽ tự động ánh xạ gắn kết hai tệp SQL vào thư mục `/docker-entrypoint-initdb.d/` bên trong container PostgreSQL khi khởi động:

| Tên tệp tin | Thứ tự chạy | Mục đích nhiệm vụ |
|---|---|---|
| `db_schema/schema.sql` | 01 | Khởi tạo cấu trúc toàn bộ các bảng dữ liệu và chỉ mục |
| `db_schema/seed.sql` | 02 | Nạp dữ liệu mẫu ban đầu để sẵn sàng trải nghiệm chạy thử |

Các đoạn script khởi tạo này chỉ hoạt động khi thư mục volume lưu trữ CSDL `postgres_data` hoàn toàn rỗng. Để tiến hành làm sạch và nạp lại dữ liệu mẫu từ đầu, hãy xóa phân vùng volume này:

```bash
docker compose down -v          # dừng các container và xóa sạch các volume đi kèm
docker compose up --build -d    # khởi chạy sạch từ đầu — dữ liệu mẫu tự động được nạp lại
```

---

## Chạy Các Bài Kiểm Thử (Running Tests)

Các bài kiểm thử tự động (tests) được thiết lập chạy độc lập hoàn toàn với cơ sở dữ liệu thực thông qua cơ chế cấu hình giả lập bộ nhớ nhẹ trong RAM (xem chi tiết cấu hình tại tệp `tests/conftest.py`):

```bash
# Khởi chạy bộ kiểm thử bên trong container Docker độc lập (mô phỏng chính xác môi trường CI)
docker compose run --rm backend python -m pytest tests/ --tb=short

# Hoặc khởi chạy bộ kiểm thử trực tiếp trên máy host của bạn (yêu cầu đã cài đặt Python 3.10 và các phụ thuộc)
pip install uv
uv pip install -r requirements.txt -r requirements-test.txt --system
python -m pytest tests/ --tb=short
```

---

## Các Câu Lệnh Docker Thường Dùng

```bash
# Build và cập nhật lại chỉ một dịch vụ riêng lẻ mà không cần khởi động lại các container khác
docker compose up --build -d backend

# Theo dõi trực tiếp log của riêng một dịch vụ cụ thể
docker compose logs -f backend

# Mở một cửa sổ dòng lệnh bash tương tác ngay bên trong container backend đang chạy
docker compose exec backend bash

# Mở giao diện psql tương tác quản lý trực tiếp bên trong container postgres
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB

# Dừng toàn bộ các dịch vụ hệ thống (nhưng giữ nguyên dữ liệu đã lưu trong các volume)
docker compose down

# Dừng toàn bộ các dịch vụ hệ thống đồng thời xóa sạch dữ liệu volume đi kèm (khởi tạo lại sạch sẽ)
docker compose down -v

# Liệt kê danh sách tất cả các container đang vận hành trong dự án
docker compose ps

# Xem chi tiết mức độ tiêu thụ tài nguyên phần cứng (CPU, Memory,...) theo thời gian thực
docker stats
```

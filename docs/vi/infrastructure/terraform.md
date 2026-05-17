# Hướng Dẫn Sử Dụng Terraform (Terraform Guide)

Mã nguồn định nghĩa hạ tầng dưới dạng code (Infrastructure-as-code) được lưu trữ tập trung tại thư mục `terraforms/`. Dự án hỗ trợ khởi tạo trên hai nhà cung cấp dịch vụ đám mây lớn: **GCP** (đang hoạt động chính thức cho môi trường production) và **AWS** (chỉ sử dụng module cấu hình VPC + RDS PostgreSQL, phần cấu hình cụm máy chủ EKS hiện tại đang được comment lại).

```
terraforms/
├── GCP/
│   ├── main.tf          # Cấu hình cụm GKE, nhóm node pool, và dịch vụ Cloud NAT
│   ├── cloudsql.tf      # Cấu hình máy chủ cơ sở dữ liệu Cloud SQL PostgreSQL
│   ├── provider.tf      # Cấu hình nhà cung cấp dịch vụ (provider) google
│   ├── variables.tf     # Định nghĩa toàn bộ các biến cấu hình đầu vào
│   ├── outputs.tf       # Định nghĩa các giá trị xuất ra (endpoint cụm, thông tin kết nối CSDL,...)
│   ├── dev.tfvars       # Cấu hình đè thông số cho môi trường dev
│   └── prod.tfvars      # Cấu hình đè thông số cho môi trường production
└── AWS/
    ├── main.tf          # Cấu hình mạng VPC, subnet, cổng Internet Gateway (EKS đang bị comment)
    ├── rds.tf           # Cấu hình máy chủ cơ sở dữ liệu RDS PostgreSQL
    ├── provider.tf      # Cấu hình nhà cung cấp dịch vụ (provider) aws
    ├── variables.tf     # Định nghĩa toàn bộ các biến cấu hình đầu vào
    └── outputs.tf       # Định nghĩa các giá trị xuất ra
```

---

## Module Triển Khai Trên GCP

### Các tài nguyên được khởi tạo tự động

| Loại tài nguyên | Tài nguyên khai báo trong Terraform | Ghi chú chi tiết |
|---|---|---|
| Cụm GKE (GKE cluster) | `google_container_cluster.primary` | Thực hiện loại bỏ node pool mặc định; Kích hoạt cơ chế xác thực bảo mật Workload Identity |
| Nhóm node pool của GKE | `google_container_node_pool.primary_nodes` | Tự động quản lý node, cho phép tùy biến số lượng và cấu hình máy chạy node |
| Cloud NAT + Router | `google_compute_router_nat` | Chỉ được khởi tạo khi thiết lập biến `enable_private_nodes = true` |
| Cloud SQL (PostgreSQL) | `google_sql_database_instance` (định nghĩa trong cloudsql.tf) | Cho phép tùy chỉnh phiên bản nhân CSDL, gói tài nguyên (tier), và cấu hình dự phòng |

### Các biến cấu hình đầu vào (`terraforms/GCP/variables.tf`)

| Biến đầu vào | Giá trị mặc định | Mô tả chi tiết |
|---|---|---|
| `project_id` | `vinuniai` | Mã định danh dự án trên GCP của bạn |
| `region` | `us-central1` | Vùng địa lý chạy dịch vụ của GCP |
| `zone` | `us-central1-a` | Vùng (zone) hoạt động cụ thể cho cụm máy chủ GKE |
| `cluster_name` | `vinai-cluster` | Tên của cụm Kubernetes GKE |
| `node_machine_type` | `e2-standard-2` | Cấu hình tài nguyên máy chạy của các node trong GKE |
| `kubernetes_version` | `1.30.14-gke.1267000` | Ghim chính xác phiên bản GKE chạy (đặt `null` để hệ thống tự quản lý) |
| `node_count` | `2` | Số lượng node hoạt động trong nhóm node pool |
| `disk_type` | `pd-standard` | Loại ổ đĩa khởi động của node (`pd-standard` hoặc ổ tốc độ cao `pd-ssd`) |
| `disk_size_gb` | `50` | Dung lượng đĩa khởi động tính bằng đơn vị GB |
| `node_auto_upgrade` | `false` | Cho phép hệ thống tự động cập nhật nâng cấp phiên bản cho các node |
| `release_channel` | `UNSPECIFIED` | Kênh phát hành phiên bản tự động của GKE |
| `enable_private_nodes` | `false` | Chỉ cấp địa chỉ IP nội bộ cho node (yêu cầu cấu hình thêm Cloud NAT) |
| `master_ipv4_cidr_block` | `172.16.0.0/28` | Dải IP CIDR dành riêng cho endpoint điều khiển cụm (Control Plane) |
| `k8s_namespace` | `english-speaking-agent` | Không gian tên Kubernetes dùng để liên kết chính sách bảo mật Workload Identity |
| `k8s_service_account_name` | `backend-sa` | Tài khoản dịch vụ ServiceAccount liên kết với chính sách Workload Identity |
| `db_name` | `english_speaking_agent` | Tên cơ sở dữ liệu chính khởi tạo trong Cloud SQL |
| `db_user` | `backend_user` | Tên người dùng truy cập cơ sở dữ liệu PostgreSQL |
| `db_tier` | `db-f1-micro` | Gói cấu hình phần cứng cho máy chủ Cloud SQL |
| `db_availability_type` | `ZONAL` | Chế độ dự phòng hoạt động trong một vùng (`ZONAL`) hoặc đa vùng (`REGIONAL`) |
| `db_backup_enabled` | `false` | Kích hoạt tính năng tự động sao lưu dữ liệu Cloud SQL định kỳ |
| `deletion_protection` | `false` | Khóa chống thao tác vô ý xóa nhầm cụm Kubernetes và cơ sở dữ liệu |
| `environment` | `dev` | Nhãn phân loại môi trường chạy (`dev`, `production`) |
| `name_suffix` | `""` | Hậu tố tự động thêm vào sau tên tài nguyên (ví dụ: `-prod` cho production) |

### Hướng dẫn sử dụng

```bash
cd terraforms/GCP

# Khởi tạo các nhà cung cấp (provider) và tải các module cần thiết
terraform init

# Xem trước kế hoạch thay đổi hạ tầng (plan) cho môi trường dev
terraform plan -var-file=dev.tfvars

# Tiến hành áp dụng thay đổi hạ tầng thực tế cho môi trường dev
terraform apply -var-file=dev.tfvars

# Tiến hành áp dụng thay đổi hạ tầng thực tế cho môi trường production chạy thật
terraform apply -var-file=prod.tfvars
```

Sau khi hoàn tất lệnh áp dụng (`apply`), thực hiện lệnh sau để lấy khóa cấu hình kết nối tới cụm GKE:

```bash
gcloud container clusters get-credentials vinai-cluster \
  --zone us-central1-a \
  --project vinuniai
```

---

## Module Triển Khai Trên AWS

### Các tài nguyên được khởi tạo tự động

| Loại tài nguyên | Tài nguyên khai báo trong Terraform | Trạng thái hoạt động |
|---|---|---|
| Mạng VPC chính | `aws_vpc.main` | Đang hoạt động |
| Subnet công khai (chạy trên 2 vùng AZ) | `aws_subnet.public` | Đang hoạt động |
| Cổng Internet Gateway | `aws_internet_gateway.main` | Đang hoạt động |
| Bảng định tuyến (Route Table) | `aws_route_table.public` | Đang hoạt động |
| Máy chủ RDS PostgreSQL | `aws_db_instance` (định nghĩa tại rds.tf) | Đang hoạt động |
| Cụm máy chủ EKS (EKS Cluster) | `aws_eks_cluster` | **Đang comment lại** — GKE được chọn sử dụng thay thế |

> **Lưu ý:** Các cấu trúc khai báo cụm EKS và nhóm node (node group) vẫn có sẵn trong tệp `main.tf` nhưng hiện đang được comment lại để tiết kiệm chi phí. Module AWS ở thời điểm hiện tại chỉ đảm nhận khởi tạo hạ tầng mạng VPC và một cơ sở dữ liệu RDS PostgreSQL.

### Các biến cấu hình đầu vào (`terraforms/AWS/variables.tf`)

| Biến đầu vào | Giá trị mặc định | Mô tả chi tiết |
|---|---|---|
| `region` | `us-east-1` | Vùng khu vực địa lý của AWS chạy tài nguyên |
| `cluster_name` | `my-eks-cluster` | Tiền tố đặt tên chung cho VPC và các tài nguyên liên quan |
| `vpc_cidr` | `10.0.0.0/16` | Dải khối CIDR định nghĩa cho không gian mạng của VPC |
| `rds_postgres_version` | `16.3` | Phiên bản động cơ PostgreSQL chính chạy trên RDS |
| `rds_instance_class` | `db.t4g.medium` | Gói phần cứng máy chủ cơ sở dữ liệu RDS |
| `rds_allocated_storage` | `20` | Dung lượng ổ đĩa khởi tạo ban đầu tính bằng GB |
| `rds_max_allocated_storage` | `100` | Dung lượng tối đa cho phép tự động mở rộng (autoscaling) tính bằng GB |
| `rds_db_name` | `voice_agent` | Tên cơ sở dữ liệu chính được tạo ban đầu |
| `rds_username` | `voice_agent_admin` | Tên tài khoản quản trị tối cao (Master) của CSDL RDS |
| `rds_password` | *(nhạy cảm)* | Mật khẩu truy cập RDS — **bắt buộc phải truyền vào qua biến môi trường TF_VAR_rds_password, tuyệt đối không được viết trực tiếp vào mã nguồn** |
| `rds_multi_az` | `false` | Kích hoạt tính năng hoạt động đa vùng sẵn sàng cao Multi-AZ (nên đặt `true` khi chạy production) |

### Hướng dẫn sử dụng

```bash
cd terraforms/AWS

# Khởi tạo các nhà cung cấp (provider) và tải các module cần thiết
terraform init

# Cung cấp mật khẩu truy cập RDS thông qua biến môi trường tạm (tuyệt đối không lưu vào file)
export TF_VAR_rds_password="mat-khau-bao-mat-cua-ban"

# Xem trước kế hoạch thay đổi hạ tầng trước khi chạy thật
terraform plan

# Áp dụng thay đổi thực tế khởi tạo hạ tầng lên AWS
terraform apply
```

---

## Quản Lý Trạng Thái Triển Khai (State Management)

Thông tin trạng thái hoạt động (file state) của Terraform không được lưu trữ trực tiếp trong kho lưu trữ mã nguồn Git này để bảo mật. Trước khi áp dụng các module này trong môi trường làm việc nhóm, hãy thiết lập remote backend lưu trữ tập trung.

Ví dụ cấu hình remote backend lưu trữ trên Cloud Storage của GCP:

```hcl
# Thêm đoạn cấu hình này vào tệp terraforms/GCP/provider.tf
terraform {
  backend "gcs" {
    bucket = "ten-bucket-tfstate-cua-ban"
    prefix = "english-speaking-agent/gcp"
  }
}
```

Ví dụ cấu hình remote backend lưu trữ trên S3 của AWS:

```hcl
# Thêm đoạn cấu hình này vào tệp terraforms/AWS/provider.tf
terraform {
  backend "s3" {
    bucket = "ten-bucket-tfstate-cua-ban"
    key    = "english-speaking-agent/aws/terraform.tfstate"
    region = "us-east-1"
  }
}
```

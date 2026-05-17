# Terraform Guide

Infrastructure-as-code lives under `terraforms/`. Two cloud providers are supported: **GCP** (active, used for production) and **AWS** (VPC + RDS module, EKS commented out).

```
terraforms/
├── GCP/
│   ├── main.tf          # GKE cluster, node pool, Cloud NAT
│   ├── cloudsql.tf      # Cloud SQL PostgreSQL instance
│   ├── provider.tf      # google provider configuration
│   ├── variables.tf     # all input variables
│   ├── outputs.tf       # exported values (cluster endpoint, DB connection, etc.)
│   ├── dev.tfvars       # dev environment overrides
│   └── prod.tfvars      # production environment overrides
└── AWS/
    ├── main.tf          # VPC, subnets, internet gateway (EKS commented out)
    ├── rds.tf           # RDS PostgreSQL instance
    ├── provider.tf      # aws provider configuration
    ├── variables.tf     # all input variables
    └── outputs.tf       # exported values
```

---

## GCP Module

### What it provisions

| Resource | Terraform resource | Notes |
|----------|--------------------|-------|
| GKE cluster | `google_container_cluster.primary` | Removes default node pool; Workload Identity enabled |
| GKE node pool | `google_container_node_pool.primary_nodes` | Managed, configurable count and machine type |
| Cloud NAT + Router | `google_compute_router_nat` | Created only when `enable_private_nodes = true` |
| Cloud SQL (PostgreSQL) | `google_sql_database_instance` (cloudsql.tf) | Version, tier, availability type configurable |

### Variables (`terraforms/GCP/variables.tf`)

| Variable | Default | Description |
|----------|---------|-------------|
| `project_id` | `vinuniai` | GCP project ID |
| `region` | `us-central1` | GCP region |
| `zone` | `us-central1-a` | Zone for the cluster |
| `cluster_name` | `vinai-cluster` | GKE cluster name |
| `node_machine_type` | `e2-standard-2` | Machine type for GKE nodes |
| `kubernetes_version` | `1.30.14-gke.1267000` | Pinned GKE version (`null` to let release channel manage) |
| `node_count` | `2` | Number of nodes in the node pool |
| `disk_type` | `pd-standard` | Boot disk type (`pd-standard` or `pd-ssd`) |
| `disk_size_gb` | `50` | Boot disk size in GB |
| `node_auto_upgrade` | `false` | Enable automatic node upgrades |
| `release_channel` | `UNSPECIFIED` | GKE release channel |
| `enable_private_nodes` | `false` | Give nodes internal IPs only (requires Cloud NAT) |
| `master_ipv4_cidr_block` | `172.16.0.0/28` | Control plane private endpoint CIDR (used with private nodes) |
| `k8s_namespace` | `english-speaking-agent` | Kubernetes namespace for Workload Identity binding |
| `k8s_service_account_name` | `backend-sa` | Kubernetes ServiceAccount bound to Workload Identity |
| `db_name` | `english_speaking_agent` | Cloud SQL database name |
| `db_user` | `backend_user` | Cloud SQL PostgreSQL user |
| `db_tier` | `db-f1-micro` | Cloud SQL machine tier |
| `db_availability_type` | `ZONAL` | `ZONAL` or `REGIONAL` |
| `db_backup_enabled` | `false` | Enable automated Cloud SQL backups |
| `deletion_protection` | `false` | Prevent accidental deletion of cluster and DB |
| `environment` | `dev` | Environment label (`dev`, `production`) |
| `name_suffix` | `""` | Suffix appended to resource names (e.g. `-prod` for production) |

### Usage

```bash
cd terraforms/GCP

# Initialize providers and modules
terraform init

# Plan against dev environment
terraform plan -var-file=dev.tfvars

# Apply dev environment
terraform apply -var-file=dev.tfvars

# Apply production environment
terraform apply -var-file=prod.tfvars
```

After `apply`, retrieve the cluster credentials:

```bash
gcloud container clusters get-credentials vinai-cluster \
  --zone us-central1-a \
  --project vinuniai
```

---

## AWS Module

### What it provisions

| Resource | Terraform resource | Status |
|----------|--------------------|--------|
| VPC | `aws_vpc.main` | Active |
| Public subnets (2 AZs) | `aws_subnet.public` | Active |
| Internet Gateway | `aws_internet_gateway.main` | Active |
| Route Table | `aws_route_table.public` | Active |
| RDS PostgreSQL | `aws_db_instance` (rds.tf) | Active |
| EKS Cluster | `aws_eks_cluster` | **Commented out** — GKE is used instead |

> Note: The EKS cluster and node group definitions exist in `main.tf` but are commented out. The AWS module currently provisions VPC networking and an RDS instance only.

### Variables (`terraforms/AWS/variables.tf`)

| Variable | Default | Description |
|----------|---------|-------------|
| `region` | `us-east-1` | AWS region |
| `cluster_name` | `my-eks-cluster` | Name prefix for VPC and other resources |
| `vpc_cidr` | `10.0.0.0/16` | CIDR block for the VPC |
| `rds_postgres_version` | `16.3` | PostgreSQL engine version |
| `rds_instance_class` | `db.t4g.medium` | RDS instance type |
| `rds_allocated_storage` | `20` | Initial storage in GB |
| `rds_max_allocated_storage` | `100` | Max autoscaling storage in GB |
| `rds_db_name` | `voice_agent` | Initial database name |
| `rds_username` | `voice_agent_admin` | Master RDS username |
| `rds_password` | *(sensitive)* | Master RDS password — **must be supplied via `TF_VAR_rds_password`, never hardcoded** |
| `rds_multi_az` | `false` | Enable Multi-AZ for high availability (set `true` in production) |

### Usage

```bash
cd terraforms/AWS

# Initialize providers and modules
terraform init

# Supply the RDS password via environment variable (never commit it)
export TF_VAR_rds_password="a-strong-password"

# Plan
terraform plan

# Apply
terraform apply
```

---

## State Management

Terraform state is not managed in this repository. Before using either module in a shared environment, configure a remote backend. Example for GCP:

```hcl
# Add to terraforms/GCP/provider.tf
terraform {
  backend "gcs" {
    bucket = "your-tfstate-bucket"
    prefix = "english-speaking-agent/gcp"
  }
}
```

Example for AWS:

```hcl
# Add to terraforms/AWS/provider.tf
terraform {
  backend "s3" {
    bucket = "your-tfstate-bucket"
    key    = "english-speaking-agent/aws/terraform.tfstate"
    region = "us-east-1"
  }
}
```

variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "vinuniai"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for the cluster"
  type        = string
  default     = "us-central1-a"
}

variable "cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
  default     = "vinai-cluster"
}

variable "node_machine_type" {
  description = "Machine type for GKE nodes"
  type        = string
  default     = "e2-standard-2"
}

variable "kubernetes_version" {
  description = "GKE Kubernetes version — pin for dev (UNSPECIFIED channel), set null to let release channel manage it"
  type        = string
  default     = "1.30.14-gke.1267000"
  nullable    = true
}

variable "db_name" {
  description = "Cloud SQL database name"
  type        = string
  default     = "english_speaking_agent"
}

variable "db_user" {
  description = "Cloud SQL PostgreSQL user"
  type        = string
  default     = "backend_user"
}

variable "k8s_service_account_name" {
  description = "Kubernetes ServiceAccount name for Workload Identity binding"
  type        = string
  default     = "backend-sa"
}

variable "k8s_namespace" {
  description = "Kubernetes namespace for the English Speaking Agent workloads"
  type        = string
  default     = "english-speaking-agent"
}

variable "environment" {
  description = "Deployment environment label (e.g. dev, production)"
  type        = string
  default     = "dev"
}

variable "name_suffix" {
  description = "Suffix appended to resource names to avoid conflicts between environments (e.g. '' for dev, '-prod' for production)"
  type        = string
  default     = ""
}

variable "deletion_protection" {
  description = "Prevent accidental deletion of the GKE cluster and Cloud SQL instance"
  type        = bool
  default     = false
}

variable "node_count" {
  description = "Number of nodes in the GKE node pool"
  type        = number
  default     = 2
}

variable "disk_type" {
  description = "Boot disk type for GKE nodes (pd-standard or pd-ssd)"
  type        = string
  default     = "pd-standard"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB for GKE nodes"
  type        = number
  default     = 50
}

variable "node_auto_upgrade" {
  description = "Enable automatic node upgrades on the GKE node pool"
  type        = bool
  default     = false
}

variable "enable_private_nodes" {
  description = "Give GKE nodes internal IPs only — internet access via Cloud NAT"
  type        = bool
  default     = false
}

variable "master_ipv4_cidr_block" {
  description = "CIDR for the GKE control plane private endpoint (/28, must not overlap with VPC subnets)"
  type        = string
  default     = "172.16.0.0/28"
}

variable "release_channel" {
  description = "GKE release channel (UNSPECIFIED, STABLE, REGULAR, RAPID)"
  type        = string
  default     = "UNSPECIFIED"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "db_availability_type" {
  description = "Cloud SQL availability type (ZONAL or REGIONAL)"
  type        = string
  default     = "ZONAL"
}

variable "db_backup_enabled" {
  description = "Enable automated backups for Cloud SQL"
  type        = bool
  default     = false
}

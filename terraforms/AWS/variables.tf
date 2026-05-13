variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "VinAI-cluster"
  type        = string
  default     = "my-eks-cluster"
}

# variable "node_instance_type" {
#   description = "EC2 instance type for worker nodes"
#   type        = string
#   default     = "t3.medium"
# }

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# =========================
# RDS Variables
# =========================

variable "rds_postgres_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.3"
}

variable "rds_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t4g.medium"
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage autoscaling limit in GB"
  type        = number
  default     = 100
}

variable "rds_db_name" {
  description = "Name of the initial database"
  type        = string
  default     = "voice_agent"
}

variable "rds_username" {
  description = "Master username for RDS"
  type        = string
  default     = "voice_agent_admin"
}

variable "rds_password" {
  description = "Master password for RDS (use TF_VAR_rds_password env var — never hardcode)"
  type        = string
  sensitive   = true
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ deployment for high availability"
  type        = bool
  default     = false # set true in production
}

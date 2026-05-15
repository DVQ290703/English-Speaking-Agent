# =============================================================================
# Production environment overrides
# Usage: terraform apply -var-file=prod.tfvars
# =============================================================================

environment         = "production"
name_suffix         = "-prod"
cluster_name        = "vinai-cluster-prod"
deletion_protection = true

# GKE node pool
kubernetes_version     = null  # STABLE release channel manages the version
enable_private_nodes   = true
master_ipv4_cidr_block = "172.16.0.0/28"
node_count             = 2
disk_type         = "pd-ssd"
disk_size_gb      = 100
node_auto_upgrade = true
release_channel   = "STABLE"

# Cloud SQL
db_tier              = "db-g1-small"
db_availability_type = "REGIONAL"
db_backup_enabled    = true

# =============================================================================
# Development environment overrides
# Usage: terraform apply -var-file=dev.tfvars
# =============================================================================

environment         = "dev"
deletion_protection = false

# GKE node pool
node_count        = 2
disk_type         = "pd-standard"
disk_size_gb      = 50
node_auto_upgrade = false
release_channel   = "UNSPECIFIED"

# Cloud SQL
db_tier              = "db-f1-micro"
db_availability_type = "ZONAL"
db_backup_enabled    = false

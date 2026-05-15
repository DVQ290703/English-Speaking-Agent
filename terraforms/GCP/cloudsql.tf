# =============================================================================
# Cloud SQL — English Speaking Agent
# PostgreSQL 15, db-f1-micro, private IP, Auth Proxy via Workload Identity
# =============================================================================

# ── Enable required API ───────────────────────────────────────────────────────
resource "google_project_service" "servicenetworking" {
  service            = "servicenetworking.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sqladmin" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

# ── VPC private services access ───────────────────────────────────────────────
# Allocate a /16 private IP range in the default VPC for Cloud SQL peering.
resource "google_compute_global_address" "private_ip_range" {
  name          = "cloudsql-private-ip-range${var.name_suffix}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = "default"

  depends_on = [google_project_service.servicenetworking]
}

# Peer the default VPC to Google's service networking so Cloud SQL gets a
# private IP reachable from the GKE cluster.
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = "projects/${var.project_id}/global/networks/default"
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]

  depends_on = [google_project_service.servicenetworking]

  # This connection is shared across environments — never destroy it via Terraform
  lifecycle {
    prevent_destroy = true
  }
}

# ── Cloud SQL instance ────────────────────────────────────────────────────────
resource "google_sql_database_instance" "main" {
  name             = "english-speaking-agent-db${var.name_suffix}"
  database_version = "POSTGRES_15"
  region           = var.region
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.db_tier
    availability_type = var.db_availability_type

    ip_configuration {
      ipv4_enabled    = false
      private_network = "projects/${var.project_id}/global/networks/default"
    }

    location_preference {
      zone = var.zone
    }

    backup_configuration {
      enabled = var.db_backup_enabled
    }
  }

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
    google_project_service.sqladmin,
  ]
}

# ── Database ──────────────────────────────────────────────────────────────────
resource "google_sql_database" "app_db" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

# ── User ──────────────────────────────────────────────────────────────────────
resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "google_sql_user" "app_user" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# ── Auth Proxy Service Account ────────────────────────────────────────────────
resource "google_service_account" "cloudsql_proxy" {
  account_id   = "cloudsql-proxy${var.name_suffix}"
  display_name = "Cloud SQL Auth Proxy Service Account (${var.environment})"
}

# Grant the GSA permission to connect to any Cloud SQL instance in the project.
resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudsql_proxy.email}"
}

# Workload Identity binding: allows the K8s SA (backend-sa in
# english-speaking-agent namespace) to impersonate the GSA — no key file needed.
resource "google_service_account_iam_member" "workload_identity_binding" {
  service_account_id = google_service_account.cloudsql_proxy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.k8s_namespace}/${var.k8s_service_account_name}]"
}

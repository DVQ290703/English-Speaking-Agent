output "cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "kubeconfig_command" {
  description = "Command to configure kubectl"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --zone ${var.zone} --project ${var.project_id}"
}

output "cloudsql_connection_name" {
  description = "Cloud SQL instance connection name — use in Auth Proxy --instances flag"
  value       = google_sql_database_instance.main.connection_name
}

output "db_name" {
  description = "Cloud SQL database name"
  value       = google_sql_database.app_db.name
}

output "db_user" {
  description = "Cloud SQL database user"
  value       = google_sql_user.app_user.name
}

output "db_password" {
  description = "Cloud SQL database password — populate backend-secret K8s Secret with this"
  value       = random_password.db_password.result
  sensitive   = true
}

output "cloudsql_proxy_sa_email" {
  description = "GSA email — annotate the backend-sa K8s ServiceAccount with iam.gke.io/gcp-service-account=<this value>"
  value       = google_service_account.cloudsql_proxy.email
}

# output "cluster_name" {
#   description = "EKS cluster name"
#   value       = aws_eks_cluster.main.name
# }
#
# output "cluster_endpoint" {
#   description = "EKS cluster endpoint"
#   value       = aws_eks_cluster.main.endpoint
#   sensitive   = true
# }
#
# output "kubeconfig_command" {
#   description = "Command to configure kubectl"
#   value       = "aws eks update-kubeconfig --region ${var.region} --name ${aws_eks_cluster.main.name}"
# }

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "rds_db_name" {
  description = "RDS database name"
  value       = aws_db_instance.postgres.db_name
}

output "rds_username" {
  description = "RDS master username"
  value       = aws_db_instance.postgres.username
  sensitive   = true
}

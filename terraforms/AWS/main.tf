# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.cluster_name}-vpc" }
}

# Subnets (2 AZs for HA)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                        = "${var.cluster_name}-public-${count.index}"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    "kubernetes.io/role/elb"                    = "1"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.cluster_name}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.cluster_name}-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

data "aws_availability_zones" "available" {}

# =========================
# EKS (commented out — RDS is accessed from GKE instead)
# =========================

# # IAM — Cluster Role
# resource "aws_iam_role" "cluster" {
#   name = "${var.cluster_name}-cluster-role"
#
#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [{
#       Action    = "sts:AssumeRole"
#       Effect    = "Allow"
#       Principal = { Service = "eks.amazonaws.com" }
#     }]
#   })
#
#   description = "Grants the Amazon EKS control plane permissions to manage AWS resources required for cluster operation, including networking, load balancing, and node lifecycle management."
# }
#
# resource "aws_iam_role_policy_attachment" "cluster_policy" {
#   role       = aws_iam_role.cluster.name
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
# }
#
# # IAM — Node Role
# resource "aws_iam_role" "node" {
#   name = "${var.cluster_name}-node-role"
#
#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [{
#       Action    = "sts:AssumeRole"
#       Effect    = "Allow"
#       Principal = { Service = "ec2.amazonaws.com" }
#     }]
#   })
# }
#
# resource "aws_iam_role_policy_attachment" "node_worker_policy" {
#   role       = aws_iam_role.node.name
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
# }
#
# resource "aws_iam_role_policy_attachment" "node_cni_policy" {
#   role       = aws_iam_role.node.name
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
# }
#
# resource "aws_iam_role_policy_attachment" "node_ecr_policy" {
#   role       = aws_iam_role.node.name
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
# }
#
# # EKS Cluster
# resource "aws_eks_cluster" "main" {
#   name     = var.cluster_name
#   role_arn = aws_iam_role.cluster.arn
#   version  = "1.30"
#
#   vpc_config {
#     subnet_ids = aws_subnet.public[*].id
#   }
#
#   access_config {
#     authentication_mode = "API"
#   }
#
#   depends_on = [aws_iam_role_policy_attachment.cluster_policy]
# }
#
# # Node Group (2 nodes)
# resource "aws_eks_node_group" "main" {
#   cluster_name    = aws_eks_cluster.main.name
#   node_group_name = "${var.cluster_name}-nodes"
#   node_role_arn   = aws_iam_role.node.arn
#   subnet_ids      = aws_subnet.public[*].id
#   instance_types  = [var.node_instance_type]
#
#   scaling_config {
#     desired_size = 2
#     min_size     = 2
#     max_size     = 4
#   }
#
#   tags = { Name = "${var.cluster_name}-node-group" }
#
#   depends_on = [
#     aws_iam_role_policy_attachment.node_worker_policy,
#     aws_iam_role_policy_attachment.node_cni_policy,
#     aws_iam_role_policy_attachment.node_ecr_policy,
#   ]
# }

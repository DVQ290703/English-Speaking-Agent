# =========================
# Private Subnets for RDS
# =========================

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.cluster_name}-private-${count.index}"
  }
}

# Private route table (no internet gateway — RDS does not need outbound internet)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.cluster_name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# =========================
# Security Group for RDS
# =========================

resource "aws_security_group" "rds" {
  name        = "${var.cluster_name}-rds-sg"
  description = "Allow PostgreSQL access from EKS nodes only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "PostgreSQL from within VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.cluster_name}-rds-sg" }
}

# =========================
# DB Subnet Group
# =========================

resource "aws_db_subnet_group" "main" {
  name        = "${var.cluster_name}-db-subnet-group"
  description = "Private subnets for RDS (multi-AZ)"
  subnet_ids  = aws_subnet.private[*].id

  tags = { Name = "${var.cluster_name}-db-subnet-group" }
}

# =========================
# RDS PostgreSQL Instance
# =========================

resource "aws_db_instance" "postgres" {
  identifier        = "${var.cluster_name}-postgres"
  engine            = "postgres"
  engine_version    = var.rds_postgres_version
  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage

  db_name  = var.rds_db_name
  username = var.rds_username
  password = var.rds_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # HA
  multi_az = var.rds_multi_az

  # Storage
  storage_type          = "gp3"
  storage_encrypted     = true
  max_allocated_storage = var.rds_max_allocated_storage

  # Backups
  backup_retention_period   = 7
  backup_window             = "03:00-04:00"
  maintenance_window        = "mon:04:00-mon:05:00"
  delete_automated_backups  = false

  # Safety
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.cluster_name}-postgres-final-snapshot"
  publicly_accessible       = false

  # Performance Insights (free tier: 7 days retention)
  performance_insights_enabled = true

  tags = { Name = "${var.cluster_name}-postgres" }
}

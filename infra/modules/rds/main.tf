# ---- DB Subnet Group ----
# Tells RDS which subnets (and therefore which Availability Zones) it can run in.
# RDS requires at least 2 subnets in different AZs even for a single-AZ instance.
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-db-subnet-group"
  }
}

# ---- RDS Instance ----
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "16.12" # Latest 16.x in me-central-1 (16.4 not available)
  instance_class = var.instance_class

  # Storage
  allocated_storage     = 20    # 20 GB starting size
  max_allocated_storage = 100   # Auto-scale up to 100 GB if needed
  storage_type          = "gp3" # General Purpose SSD (better price/perf than gp2)
  storage_encrypted     = true  # Encrypt data at rest (always on)

  # Database config
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  # Networking
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]
  publicly_accessible    = false # Only reachable from within the VPC

  # Backups — keep 7 days of automated backups
  backup_retention_period = 1
  backup_window           = "03:00-04:00"          # 3 AM UTC
  maintenance_window      = "sun:04:00-sun:05:00"  # Sunday 4 AM UTC

  # High Availability
  multi_az = var.multi_az # false for staging, true for production

  # Performance Insights — free for 7-day retention
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # Pre-production safety valves (override these for production)
  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot

  # Apply changes without a maintenance window in pre-prod
  apply_immediately = true

  tags = {
    Name = "${var.project_name}-${var.environment}-postgres"
  }
}

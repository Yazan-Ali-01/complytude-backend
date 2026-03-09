# ---- ElastiCache Subnet Group ----
# Redis requires a subnet group with subnets in at least 2 AZs.
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-redis-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-subnet-group"
  }
}

# ---- ElastiCache Redis 7 Replication Group ----
# Single-node for staging; add replicas for production.
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "Redis 7 for ${var.project_name} ${var.environment}"

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  port                 = 6379

  # Networking
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]

  # Single-node: no automatic failover
  automatic_failover_enabled = var.num_cache_clusters > 1

  # Staging-friendly: apply changes immediately (no maintenance window)
  apply_immediately = var.apply_immediately

  # Encryption at rest (recommended)
  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.transit_encryption_enabled

  # Auth token required when transit encryption is enabled
  auth_token = var.transit_encryption_enabled ? var.auth_token : null

  # Maintenance
  maintenance_window       = var.maintenance_window
  snapshot_window           = var.snapshot_window
  snapshot_retention_limit  = var.snapshot_retention_limit

  tags = {
    Name = "${var.project_name}-${var.environment}-redis"
  }
}

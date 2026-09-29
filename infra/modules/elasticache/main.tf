# ---- ElastiCache Subnet Group ----
# Redis requires a subnet group with subnets in at least 2 AZs.
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-redis-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-subnet-group"
  }
}

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# ---- Parameters ----
# BullMQ requires noeviction: the default group's volatile-lru evicts keys with a TTL under
# memory pressure, which includes job locks (jobs stall and run twice) and sessions (users
# logged out). With noeviction, writes fail loudly at maxmemory instead.
resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-redis${local.engine_major}"
  family = "redis${local.engine_major}"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-params"
  }
}

locals {
  engine_major = split(".", var.engine_version)[0]
  # Two or more nodes: a replica in another AZ takes over automatically
  failover = var.num_cache_clusters > 1
}

# ---- Auth token ----
# Generated unless given; only characters ElastiCache accepts in an AUTH token.
resource "random_password" "auth_token" {
  count            = var.transit_encryption_enabled && var.auth_token == null ? 1 : 0
  length           = 48
  special          = true
  override_special = "!&#$^<>-"
}

# ---- ElastiCache Redis 7 Replication Group ----
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "Redis 7 for ${var.project_name} ${var.environment}"

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.main.name

  # Networking
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]

  automatic_failover_enabled = local.failover
  multi_az_enabled           = local.failover

  # Staging-friendly: apply changes immediately (no maintenance window)
  apply_immediately = var.apply_immediately

  # Encryption at rest (recommended)
  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.transit_encryption_enabled

  # AUTH needs TLS; without it anything in the security group could use the queues
  auth_token = var.transit_encryption_enabled ? coalesce(var.auth_token, one(random_password.auth_token[*].result)) : null

  # Maintenance
  maintenance_window       = var.maintenance_window
  snapshot_window          = var.snapshot_window
  snapshot_retention_limit = var.snapshot_retention_limit

  tags = {
    Name = "${var.project_name}-${var.environment}-redis"
  }
}

output "replication_group_id" {
  description = "ID of the Redis replication group"
  value       = aws_elasticache_replication_group.main.id
}

output "primary_endpoint_address" {
  description = "Primary endpoint hostname for Redis"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "primary_endpoint_port" {
  description = "Primary endpoint port"
  value       = aws_elasticache_replication_group.main.port
}

output "configuration_endpoint_address" {
  description = "Configuration endpoint (for cluster mode); same as primary for single-node"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
}

output "reader_endpoint_address" {
  description = "Reader endpoint (for read replicas); null when num_cache_clusters = 1"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "endpoint" {
  description = "Full Redis endpoint (hostname:port) — use for REDIS_URL"
  value       = "${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}"
}

output "hostname" {
  description = "Redis hostname — use as REDIS_HOST"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "port" {
  description = "Redis port (6379)"
  value       = aws_elasticache_replication_group.main.port
}

output "auth_token" {
  description = "Redis AUTH token (null when TLS is off); pass to the app as REDIS_PASSWORD"
  value       = aws_elasticache_replication_group.main.auth_token
  sensitive   = true
}

output "tls_enabled" {
  description = "Whether clients must connect with TLS (REDIS_TLS)"
  value       = aws_elasticache_replication_group.main.transit_encryption_enabled
}

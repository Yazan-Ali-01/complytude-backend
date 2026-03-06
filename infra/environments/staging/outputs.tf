output "vpc_id" {
  description = "ID of the staging VPC"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the staging public subnets"
  value       = module.networking.public_subnet_ids
}

output "vpc_cidr_block" {
  description = "CIDR block of the staging VPC"
  value       = module.networking.vpc_cidr_block
}

output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = module.networking.alb_security_group_id
}

output "ecs_security_group_id" {
  description = "ID of the ECS security group"
  value       = module.networking.ecs_security_group_id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = module.networking.rds_security_group_id
}

output "redis_security_group_id" {
  description = "ID of the Redis security group"
  value       = module.networking.redis_security_group_id
}

output "rds_endpoint" {
  description = "Full RDS endpoint (hostname:port) — use for connection strings"
  value       = module.rds.endpoint
}

output "rds_hostname" {
  description = "RDS hostname — use this as DB_HOST in your app's environment variables"
  value       = module.rds.hostname
}

output "rds_port" {
  description = "RDS port (5432)"
  value       = module.rds.port
}

output "rds_db_name" {
  description = "RDS database name"
  value       = module.rds.db_name
}

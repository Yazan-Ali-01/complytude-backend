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

output "redis_endpoint" {
  description = "Full Redis endpoint (hostname:port) — use for REDIS_URL"
  value       = module.elasticache.endpoint
}

output "redis_hostname" {
  description = "Redis hostname — use as REDIS_HOST"
  value       = module.elasticache.hostname
}

output "redis_port" {
  description = "Redis port (6379)"
  value       = module.elasticache.port
}

output "bastion_public_ip" {
  description = "Bastion public IP — use for SSH tunnel to RDS"
  value       = module.bastion.public_ip
}

output "s3_quarantine_bucket_name" {
  description = "Quarantine S3 bucket name — uploads go here first"
  value       = module.s3.quarantine_bucket_name
}

output "s3_clean_bucket_name" {
  description = "Clean S3 bucket name — validated files moved here"
  value       = module.s3.clean_bucket_name
}

output "ecr_repository_urls" {
  description = "ECR repository URLs — use for CI/CD to push Docker images"
  value       = module.ecr.repository_urls
}

output "app_secret_name" {
  description = "App secret (issued credentials) — fill with scripts/deploy/put-app-secrets.sh"
  value       = module.secrets.app_secret_name
}

output "db_app_secret_name" {
  description = "db-app secret (DB_APP_PASSWORD) — fill with scripts/deploy/put-app-secrets.sh"
  value       = module.secrets.db_app_secret_name
}

output "rds_master_user_secret_arn" {
  description = "RDS-managed secret with the master username and password (used by the migration pipeline)"
  value       = module.rds.master_user_secret_arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "alb_dns_name" {
  description = "ALB DNS name — use http://<dns>/api/health to verify"
  value       = module.ecs.alb_dns_name
}

output "route53_name_servers" {
  description = "Set these nameservers in Namecheap to delegate DNS to Route 53"
  value       = module.route53.name_servers
}

output "app_url" {
  description = "HTTPS URL for the staging API"
  value       = "https://${module.dns_record.app_fqdn}"
}

output "developer_access_keys" {
  description = "AWS access keys for each developer. Retrieve with: terraform output -json developer_access_keys"
  sensitive   = true
  value       = module.developers.access_keys
}

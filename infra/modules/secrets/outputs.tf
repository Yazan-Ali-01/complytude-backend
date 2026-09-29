output "app_secret_arn" {
  description = "ARN of the app secret (issued credentials; values set out of band)"
  value       = aws_secretsmanager_secret.app.arn
}

output "app_secret_name" {
  description = "Name of the app secret (for scripts/deploy/put-app-secrets.sh)"
  value       = aws_secretsmanager_secret.app.name
}

output "db_app_secret_arn" {
  description = "ARN of the db-app secret (DB_APP_PASSWORD)"
  value       = aws_secretsmanager_secret.db_app.arn
}

output "db_app_secret_name" {
  description = "Name of the db-app secret"
  value       = aws_secretsmanager_secret.db_app.name
}

output "redis_secret_arn" {
  description = "ARN of the redis secret (REDIS_PASSWORD)"
  value       = aws_secretsmanager_secret.redis.arn
}

output "ecs_secrets_policy_arn" {
  description = "IAM policy ARN for the ECS task execution role (read the three secrets)"
  value       = aws_iam_policy.ecs_read_secrets.arn
}

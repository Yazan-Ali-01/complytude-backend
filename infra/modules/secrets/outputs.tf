output "secret_arn" {
  description = "ARN of the application secrets — use in ECS task definition secrets block"
  value       = aws_secretsmanager_secret.app.arn
}

output "secret_name" {
  description = "Name of the secret — use for valueFrom: arn:aws:secretsmanager:region:account:secret:name:key::"
  value       = aws_secretsmanager_secret.app.name
}

output "ecs_secrets_policy_arn" {
  description = "ARN of IAM policy for ECS task execution role — attach to allow reading secrets"
  value       = aws_iam_policy.ecs_read_secrets.arn
}

# For ECS task definition secrets block, use:
#   valueFrom = "${secret_arn}:DB_HOST::"
# The :: at the end selects the JSON key from the secret.

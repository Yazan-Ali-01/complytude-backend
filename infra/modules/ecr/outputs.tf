output "repository_urls" {
  description = "Map of app name to ECR repository URL"
  value       = { for k, v in aws_ecr_repository.main : k => v.repository_url }
}

output "repository_arns" {
  description = "List of ECR repository ARNs"
  value       = [for v in aws_ecr_repository.main : v.arn]
}

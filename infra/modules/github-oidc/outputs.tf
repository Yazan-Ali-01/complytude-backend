output "deploy_role_arn" {
  description = "Role GitHub Actions assumes (set as the repository variable AWS_DEPLOY_ROLE_ARN)"
  value       = aws_iam_role.deploy.arn
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for alarm notifications"
  value       = aws_sns_topic.alarms.arn
}

output "api_health_check_id" {
  description = "Route 53 health check of the API readiness endpoint (null when disabled)"
  value       = one(aws_route53_health_check.api[*].id)
}

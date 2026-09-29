output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "alb_dns_name" {
  description = "ALB DNS name — use for health check and API access"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB Route53 zone ID — for alias records"
  value       = aws_lb.main.zone_id
}

output "api_service_name" {
  description = "API ECS service name"
  value       = aws_ecs_service.api.name
}

output "worker_ai_service_name" {
  description = "Worker AI ECS service name"
  value       = aws_ecs_service.worker_ai.name
}

output "worker_ingestion_service_name" {
  description = "Worker Ingestion ECS service name"
  value       = aws_ecs_service.worker_ingestion.name
}

output "worker_generation_service_name" {
  description = "Worker Generation ECS service name"
  value       = aws_ecs_service.worker_generation.name
}

output "alb_arn_suffix" {
  description = "ALB ARN suffix (CloudWatch LoadBalancer dimension)"
  value       = aws_lb.main.arn_suffix
}

output "api_target_group_arn_suffix" {
  description = "API target group ARN suffix (CloudWatch TargetGroup dimension)"
  value       = aws_lb_target_group.api.arn_suffix
}

output "log_group_names" {
  description = "CloudWatch log group per app (for metric filters)"
  value = {
    api               = aws_cloudwatch_log_group.api.name
    worker-ai         = aws_cloudwatch_log_group.worker_ai.name
    worker-ingestion  = aws_cloudwatch_log_group.worker_ingestion.name
    worker-generation = aws_cloudwatch_log_group.worker_generation.name
  }
}

output "service_arns" {
  description = "ARNs of the four ECS services (the deploy role may update these only)"
  value = [
    aws_ecs_service.api.id,
    aws_ecs_service.worker_ai.id,
    aws_ecs_service.worker_ingestion.id,
    aws_ecs_service.worker_generation.id,
  ]
}

output "passable_role_arns" {
  description = "Execution and task roles a new task-definition revision may name (iam:PassRole for the deploy role)"
  value = [
    aws_iam_role.ecs_task_execution.arn,
    aws_iam_role.api_task.arn,
    aws_iam_role.worker_ai_task.arn,
    aws_iam_role.worker_ingestion_task.arn,
    aws_iam_role.worker_generation_task.arn,
  ]
}

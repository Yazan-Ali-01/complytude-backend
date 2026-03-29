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

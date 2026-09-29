# ---- ECS Cluster ----
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}"
  }
}

# ---- CloudWatch Log Groups ----
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}-${var.environment}/api"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-${var.environment}-api-logs"
  }
}

resource "aws_cloudwatch_log_group" "worker_ai" {
  name              = "/ecs/${var.project_name}-${var.environment}/worker-ai"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-ai-logs"
  }
}

resource "aws_cloudwatch_log_group" "worker_ingestion" {
  name              = "/ecs/${var.project_name}-${var.environment}/worker-ingestion"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-ingestion-logs"
  }
}

resource "aws_cloudwatch_log_group" "worker_generation" {
  name              = "/ecs/${var.project_name}-${var.environment}/worker-generation"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-generation-logs"
  }
}

resource "aws_cloudwatch_log_group" "worker_generation_gotenberg" {
  name              = "/ecs/${var.project_name}-${var.environment}/worker-generation-gotenberg"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-generation-gotenberg-logs"
  }
}

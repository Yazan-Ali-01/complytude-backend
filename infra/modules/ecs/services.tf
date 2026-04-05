# ---- Secrets mapping for ECS task definitions ----
# Format: valueFrom = "${secret_arn}:JSON_KEY::"
locals {
  secret_keys = [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_APP_USER",
    "DB_APP_PASSWORD",
    "DB_SSL_ENABLED",
    "DB_SSL_REJECT_UNAUTHORIZED",
    "DB_MAX_CONNECTIONS",
    "DB_IDLE_TIMEOUT",
    "DB_CONNECTION_TIMEOUT",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
    "REDIS_TLS",
    "REDIS_DB",
    "REDIS_QUEUE_DB",
    "REDIS_KEY_PREFIX",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_IDENTITY_SECRET",
    "JWT_IDENTITY_REFRESH_SECRET",
    "JWT_ACCESS_EXPIRES_IN",
    "JWT_IDENTITY_EXPIRES_IN",
    "S3_REGION",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_FORCE_PATH_STYLE",
    "COMPLYTUDE_FILES_BUCKET_NAME",
    "TEMPLATES_BUCKET_NAME",
    "QUARANTINE_BUCKET_NAME",
    "MAX_FILE_SIZE",
    "TEMPLATE_MAX_FILE_SIZE",
    "SIGNED_URL_EXPIRES_IN",
    "CORS_ORIGINS",
    "OPENAI_API_KEY",
    "COHERE_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CATALOG_SYNC_ENABLED",
    "STRIPE_TAX_ENABLED",
    "BILLING_SCHEDULE_ENABLED",
    # Email (AWS SES)
    "AWS_REGION",
    "FROM_EMAIL",
    "FROM_NAME",
    "SUPPORT_EMAIL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_CALLBACK_URL",
    "MICROSOFT_TENANT_ID",
    "SSO_FRONTEND_SUCCESS_PATH",
    "SSO_FRONTEND_ERROR_PATH",
  ]
  secrets = [for k in local.secret_keys : { name = k, valueFrom = "${var.secret_arn}:${k}::" }]
}

# ---- API Task Definition ----
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  # Bumped from 512/1024 to accommodate Gotenberg (LibreOffice needs ~1 vCPU + 1.5 GB)
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${var.ecr_repository_urls["api"]}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol     = "tcp"
        }
      ]

      environment = [
        for k, v in var.api_environment : { name = k, value = v }
      ]

      secrets = local.secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"         = var.aws_region
          "awslogs-stream-prefix"  = "api"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1))\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      # Gotenberg must start before the API accepts traffic
      dependsOn = [
        {
          containerName = "gotenberg"
          condition     = "HEALTHY"
        }
      ]
    },
    {
      name      = "gotenberg"
      image     = "gotenberg/gotenberg:8"
      essential = false

      # No portMappings needed — API reaches it on localhost:3000 (shared network namespace)

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.gotenberg.name
          "awslogs-region"         = var.aws_region
          "awslogs-stream-prefix"  = "gotenberg"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 10
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-api"
  }
}

# ---- API Service ----
resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-api"
  }
}

# ---- Worker AI Task Definition ----
resource "aws_ecs_task_definition" "worker_ai" {
  family                   = "${var.project_name}-${var.environment}-worker-ai"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker-ai"
      image     = "${var.ecr_repository_urls["worker-ai"]}:${var.image_tag}"
      essential = true

      environment = [
        for k, v in var.worker_ai_environment : { name = k, value = v }
      ]

      secrets = local.secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker_ai.name
          "awslogs-region"         = var.aws_region
          "awslogs-stream-prefix"  = "worker-ai"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3001/health',r=>process.exit(r.statusCode===200?0:1))\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-ai"
  }
}

# ---- Worker AI Service ----
resource "aws_ecs_service" "worker_ai" {
  name            = "${var.project_name}-${var.environment}-worker-ai"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker_ai.arn
  desired_count   = var.worker_ai_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-ai"
  }
}

# ---- Worker Ingestion Task Definition ----
resource "aws_ecs_task_definition" "worker_ingestion" {
  family                   = "${var.project_name}-${var.environment}-worker-ingestion"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker-ingestion"
      image     = "${var.ecr_repository_urls["worker-ingestion"]}:${var.image_tag}"
      essential = true

      environment = [
        for k, v in var.worker_ingestion_environment : { name = k, value = v }
      ]

      secrets = local.secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker_ingestion.name
          "awslogs-region"         = var.aws_region
          "awslogs-stream-prefix"  = "worker-ingestion"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3002/health',r=>process.exit(r.statusCode===200?0:1))\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-ingestion"
  }
}

# ---- Worker Ingestion Service ----
resource "aws_ecs_service" "worker_ingestion" {
  name            = "${var.project_name}-${var.environment}-worker-ingestion"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker_ingestion.arn
  desired_count   = var.worker_ingestion_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-ingestion"
  }
}

# ---- Worker Generation Task Definition ----
# Gotenberg sidecar: worker-generation calls localhost:3000 for DOCX→PDF conversion.
# Fargate awsvpc tasks each get their own network namespace, so Gotenberg can't be shared
# with the API task — each worker-generation task carries its own sidecar.
resource "aws_ecs_task_definition" "worker_generation" {
  family                   = "${var.project_name}-${var.environment}-worker-generation"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  # LibreOffice inside Gotenberg needs ~1 vCPU + 1 GB. Worker itself is lightweight.
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker-generation"
      image     = "${var.ecr_repository_urls["worker-generation"]}:${var.image_tag}"
      essential = true

      environment = [
        for k, v in var.worker_generation_environment : { name = k, value = v }
      ]

      secrets = local.secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"        = aws_cloudwatch_log_group.worker_generation.name
          "awslogs-region"       = var.aws_region
          "awslogs-stream-prefix" = "worker-generation"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3003/health',r=>process.exit(r.statusCode===200?0:1))\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      dependsOn = [
        {
          containerName = "gotenberg-generation"
          condition     = "HEALTHY"
        }
      ]
    },
    {
      name      = "gotenberg-generation"
      image     = "gotenberg/gotenberg:8"
      essential = false

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"        = aws_cloudwatch_log_group.worker_generation_gotenberg.name
          "awslogs-region"       = var.aws_region
          "awslogs-stream-prefix" = "gotenberg-generation"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 10
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-generation"
  }
}

# ---- Worker Generation Service ----
resource "aws_ecs_service" "worker_generation" {
  name            = "${var.project_name}-${var.environment}-worker-generation"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker_generation.arn
  desired_count   = var.worker_generation_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-generation"
  }
}

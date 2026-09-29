# ---- Secrets mapping for ECS task definitions ----
# Format: valueFrom = "${secret_arn}:JSON_KEY::"
locals {
  # Every service verifies the DB certificate against the bundle baked into its image
  db_client_environment = {
    DB_SSL_CA_PATH = "/app/certs/rds-global-bundle.pem"
  }

  # Each service gets only the secrets it uses: a worker compromised through a document never
  # holds the JWT signing keys, Stripe or the SSO client secrets
  database_secrets = [
    { name = "DB_APP_PASSWORD", valueFrom = "${var.db_app_secret_arn}:DB_APP_PASSWORD::" },
    { name = "REDIS_PASSWORD", valueFrom = "${var.redis_secret_arn}:REDIS_PASSWORD::" },
  ]
  app_secret = { for k in [
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_IDENTITY_SECRET",
    "JWT_IDENTITY_REFRESH_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "MICROSOFT_CLIENT_SECRET",
    "BULL_BOARD_ADMIN_SECRET",
    "OPENAI_API_KEY",
    "COHERE_API_KEY",
  ] : k => { name = k, valueFrom = "${var.app_secret_arn}:${k}::" } }

  api_secrets = concat(local.database_secrets, [for k in [
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_IDENTITY_SECRET",
    "JWT_IDENTITY_REFRESH_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "MICROSOFT_CLIENT_SECRET",
    "BULL_BOARD_ADMIN_SECRET",
  ] : local.app_secret[k]])
  worker_ai_secrets = concat(local.database_secrets, [
    local.app_secret["OPENAI_API_KEY"],
    local.app_secret["COHERE_API_KEY"],
  ])
  worker_ingestion_secrets = concat(local.database_secrets, [
    local.app_secret["OPENAI_API_KEY"],
  ])
  worker_generation_secrets = local.database_secrets
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
  task_role_arn            = aws_iam_role.api_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${var.ecr_repository_urls["api"]}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol     = "tcp"
        },
        # Bull Board: internal only. The ALB targets 3000; the ECS security group admits this port from the bastion alone.
        {
          containerPort = var.bull_board_port
          protocol      = "tcp"
        }
      ]

      environment = [
        for k, v in merge(var.shared_environment, var.api_environment, local.db_client_environment, {
          BULL_BOARD_PORT    = tostring(var.bull_board_port)
          DB_MAX_CONNECTIONS = tostring(var.api_db_pool_size)
        }) : { name = k, value = v }
      ]

      secrets = local.api_secrets

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
      command   = ["gotenberg", "--api-port=3100"]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.gotenberg.name
          "awslogs-region"         = var.aws_region
          "awslogs-stream-prefix"  = "gotenberg"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3100/health || exit 1"]
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

  # CI deploys new revisions pinned to image digests (scripts/deploy/ecs-deploy.sh); Terraform
  # must not put the service back on its own revision
  lifecycle {
    ignore_changes = [task_definition]
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
  task_role_arn            = aws_iam_role.worker_ai_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker-ai"
      image     = "${var.ecr_repository_urls["worker-ai"]}:${var.image_tag}"
      essential = true
      # Time to finish active jobs after SIGTERM before SIGKILL (Fargate allows at most 120 s)
      stopTimeout = var.worker_stop_timeout

      environment = [
        for k, v in merge(var.shared_environment, var.worker_ai_environment, local.db_client_environment, {
          DB_MAX_CONNECTIONS = tostring(var.worker_db_pool_size)
        }) : { name = k, value = v }
      ]

      secrets = local.worker_ai_secrets

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

  # CI deploys new revisions pinned to image digests (scripts/deploy/ecs-deploy.sh); Terraform
  # must not put the service back on its own revision
  lifecycle {
    ignore_changes = [task_definition]
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
  task_role_arn            = aws_iam_role.worker_ingestion_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker-ingestion"
      image     = "${var.ecr_repository_urls["worker-ingestion"]}:${var.image_tag}"
      essential = true
      # Time to finish active jobs after SIGTERM before SIGKILL (Fargate allows at most 120 s)
      stopTimeout = var.worker_stop_timeout

      environment = [
        for k, v in merge(var.shared_environment, var.worker_ingestion_environment, local.db_client_environment, {
          DB_MAX_CONNECTIONS = tostring(var.worker_db_pool_size)
        }) : { name = k, value = v }
      ]

      secrets = local.worker_ingestion_secrets

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

  # CI deploys new revisions pinned to image digests (scripts/deploy/ecs-deploy.sh); Terraform
  # must not put the service back on its own revision
  lifecycle {
    ignore_changes = [task_definition]
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
  task_role_arn            = aws_iam_role.worker_generation_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker-generation"
      image     = "${var.ecr_repository_urls["worker-generation"]}:${var.image_tag}"
      essential = true
      # Time to finish active jobs after SIGTERM before SIGKILL (Fargate allows at most 120 s)
      stopTimeout = var.worker_stop_timeout

      environment = [
        for k, v in merge(var.shared_environment, var.worker_generation_environment, local.db_client_environment, {
          DB_MAX_CONNECTIONS = tostring(var.worker_db_pool_size)
        }) : { name = k, value = v }
      ]

      secrets = local.worker_generation_secrets

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
      command   = ["gotenberg", "--api-port=3100"]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"        = aws_cloudwatch_log_group.worker_generation_gotenberg.name
          "awslogs-region"       = var.aws_region
          "awslogs-stream-prefix" = "gotenberg-generation"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3100/health || exit 1"]
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

  # CI deploys new revisions pinned to image digests (scripts/deploy/ecs-deploy.sh); Terraform
  # must not put the service back on its own revision
  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-worker-generation"
  }
}

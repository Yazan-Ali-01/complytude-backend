variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for CloudWatch logs and ECR"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for ALB target group"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for ECS tasks and ALB"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group for ECS Fargate tasks"
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group for the ALB"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate for HTTPS listener"
  type        = string
}

variable "ecr_repository_urls" {
  description = "Map of app name to ECR repository URL"
  type        = map(string)
}

variable "image_tag" {
  description = "Git SHA whose images the task definitions are created with; later deploys and rollbacks go through scripts/deploy/ecs-deploy.sh"
  type        = string
}

variable "app_secret_arn" {
  description = "ARN of the app secret (JWT, Stripe, OpenAI, Cohere, SSO client secrets, Bull Board)"
  type        = string
}

variable "db_app_secret_arn" {
  description = "ARN of the db-app secret (DB_APP_PASSWORD)"
  type        = string
}

variable "redis_secret_arn" {
  description = "ARN of the redis secret (REDIS_PASSWORD)"
  type        = string
}

variable "shared_environment" {
  description = "Non-secret configuration every service gets (database and Redis endpoints, buckets, region)"
  type        = map(string)
}

variable "ecs_secrets_policy_arn" {
  description = "IAM policy ARN for ECS task execution role (read secrets)"
  type        = string
}

variable "quarantine_bucket_arn" {
  description = "ARN of the quarantine bucket (uploads before scanning and extraction)"
  type        = string
}

variable "clean_bucket_arn" {
  description = "ARN of the clean bucket (promoted uploads, templates, generated documents)"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

# Non-secret env vars per service
variable "api_environment" {
  description = "Non-secret environment variables for API"
  type        = map(string)
  default     = {}
}

variable "bull_board_port" {
  description = "Internal port Bull Board listens on in the API task (set as BULL_BOARD_PORT). Not behind the ALB; reach it through the bastion."
  type        = number
  default     = 3010
}

variable "worker_ai_environment" {
  description = "Non-secret environment variables for worker-ai"
  type        = map(string)
  default     = {}
}

variable "worker_ingestion_environment" {
  description = "Non-secret environment variables for worker-ingestion"
  type        = map(string)
  default     = {}
}

variable "worker_generation_environment" {
  description = "Non-secret environment variables for worker-generation"
  type        = map(string)
  default     = {}
}

# Desired count per service
variable "api_desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 1
}

variable "worker_ai_desired_count" {
  description = "Desired number of worker-ai tasks"
  type        = number
  default     = 1
}

variable "worker_ingestion_desired_count" {
  description = "Desired number of worker-ingestion tasks"
  type        = number
  default     = 1
}

variable "worker_generation_desired_count" {
  description = "Desired number of worker-generation tasks"
  type        = number
  default     = 1
}

variable "ses_send_policy_arn" {
  description = "ARN of the SES send email policy (optional)"
  type        = string
  default     = null
}

variable "worker_stop_timeout" {
  description = "Seconds a worker container gets after SIGTERM to finish its active jobs (Fargate maximum 120). Longer jobs are re-run from their checkpoint (e.g. a stored Textract job)."
  type        = number
  default     = 120

  validation {
    condition     = var.worker_stop_timeout >= 2 && var.worker_stop_timeout <= 120
    error_message = "worker_stop_timeout must be between 2 and 120 seconds (Fargate limit)."
  }
}

variable "alb_log_retention_days" {
  description = "Days to keep ALB access logs"
  type        = number
  default     = 90
}

variable "waf_auth_rate_limit" {
  description = "Requests per IP per 5 minutes to /api/v1/auth/ before WAF blocks the IP"
  type        = number
  default     = 300
}

variable "waf_ip_rate_limit" {
  description = "Requests per IP per 5 minutes to any route before WAF blocks the IP"
  type        = number
  default     = 3000
}

# Connection budget: (api_db_pool_size x API tasks + worker_db_pool_size x worker tasks) x 2 during
# a rolling deploy must stay under the RDS max_connections (db.t4g.micro: ~80 usable).
variable "api_db_pool_size" {
  description = "DB connections per API task"
  type        = number
  default     = 10
}

variable "worker_db_pool_size" {
  description = "DB connections per worker task (at least the worker's BullMQ concurrency)"
  type        = number
  default     = 5
}

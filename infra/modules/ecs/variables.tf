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
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "secret_arn" {
  description = "ARN of application secrets in Secrets Manager"
  type        = string
}

variable "ecs_secrets_policy_arn" {
  description = "IAM policy ARN for ECS task execution role (read secrets)"
  type        = string
}

variable "s3_bucket_arns" {
  description = "ARNs of S3 buckets for task role access"
  type        = list(string)
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

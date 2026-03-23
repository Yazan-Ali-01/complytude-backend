variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "complytude"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of AZs to deploy subnets into"
  type        = list(string)
  default     = ["eu-central-1a", "eu-central-1b"]
}

variable "db_password" {
  description = "PostgreSQL master password for RDS. Set in terraform.tfvars — never commit it."
  type        = string
  sensitive   = true

  validation {
    condition     = !can(regex("[\\/@\" ]", var.db_password))
    error_message = "RDS password cannot contain: / @ \" (space). Use only letters, numbers, and symbols like !#$%^&*()-_=+"
  }
}

variable "bastion_key_name" {
  description = "EC2 key pair name for bastion SSH access"
  type        = string
}

variable "bastion_ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH to bastion (e.g. [\"YOUR_IP/32\"]). Get your IP: curl -s ifconfig.me"
  type        = list(string)
}

# ---- Secrets Manager (application secrets) ----
variable "app_db_user" {
  description = "Application DB user — use app_login (run setup-app-user-role.sql first) or postgres for quick dev"
  type        = string
  default     = "app_login"
}

variable "app_db_password" {
  description = "Application DB password — same as db_password when using postgres user"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis auth token — empty when transit_encryption_enabled is false"
  type        = string
  default     = ""
  sensitive   = true
}

variable "redis_tls" {
  description = "Whether Redis uses TLS"
  type        = bool
  default     = false
}

variable "jwt_access_secret" {
  description = "JWT access token signing secret"
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token signing secret"
  type        = string
  sensitive   = true
}

variable "jwt_identity_secret" {
  description = "JWT identity token signing secret"
  type        = string
  sensitive   = true
}

variable "jwt_identity_refresh_secret" {
  description = "JWT identity refresh token signing secret"
  type        = string
  sensitive   = true
}

variable "jwt_refresh_hash_secret" {
  description = "JWT refresh token hash secret"
  type        = string
  sensitive   = true
}

variable "s3_access_key" {
  description = "S3 access key — create IAM user with S3 permissions, or leave empty for ECS task role"
  type        = string
  default     = ""
  sensitive   = true
}

variable "s3_secret_key" {
  description = "S3 secret key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "s3_endpoint" {
  description = "S3 endpoint URL — empty for AWS S3"
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "CORS allowed origins (comma-separated)"
  type        = string
}

variable "openai_api_key" {
  description = "OpenAI API key — required for worker-ai and worker-ingestion"
  type        = string
  default     = ""
  sensitive   = true
}

# ---- Stripe ----
variable "stripe_secret_key" {
  description = "Stripe secret key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_publishable_key" {
  description = "Stripe publishable key"
  type        = string
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_catalog_sync_enabled" {
  description = "Enable Stripe catalog sync"
  type        = string
  default     = "false"
}

variable "stripe_tax_enabled" {
  description = "Enable Stripe Tax"
  type        = string
  default     = "false"
}

# ---- Billing Scheduler ----
variable "billing_schedule_enabled" {
  description = "Enable scheduled billing jobs (daily Stripe reconciliation at 3 AM)"
  type        = bool
  default     = true
}

# ---- DNS & SSL ----
variable "domain_name" {
  description = "Root domain for the project (e.g. complytude.com)"
  type        = string
}

# ---- ECS ----
variable "ecs_image_tag" {
  description = "Docker image tag to deploy (e.g. latest, v1.0.0)"
  type        = string
  default     = "latest"
}

variable "ecs_api_desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 1
}

variable "ecs_worker_ai_desired_count" {
  description = "Desired number of worker-ai tasks"
  type        = number
  default     = 1
}

variable "ecs_worker_ingestion_desired_count" {
  description = "Desired number of worker-ingestion tasks"
  type        = number
  default     = 1
}

# ---- Email (AWS SES) ----
variable "from_email" {
  description = "From email address for sending emails (e.g., billing@complytude.com)"
  type        = string
}

variable "from_name" {
  description = "From name for sending emails"
  type        = string
  default     = "Complytude Billing"
}

variable "support_email" {
  description = "Support email address (e.g., support@complytude.com)"
  type        = string
}

# ---- Developer IAM Users ----
variable "developer_usernames" {
  description = "IAM usernames for developers (e.g. [\"john\", \"alice\"]). Each gets access keys with scoped permissions."
  type        = list(string)
  default     = []
}

# ---- Monitoring ----
variable "alarm_email" {
  description = "Email for CloudWatch alarm notifications. Set in terraform.tfvars. Must confirm SNS subscription after first apply."
  type        = string
}

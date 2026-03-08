variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

# ---- Database (from RDS outputs + credentials) ----
variable "db_host" {
  description = "RDS hostname — typically from module.rds.hostname"
  type        = string
}

variable "db_port" {
  description = "RDS port (5432)"
  type        = number
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_app_user" {
  description = "Application DB user (e.g. postgres for staging, app_login for production)"
  type        = string
}

variable "db_app_password" {
  description = "Application DB password — same as RDS master for staging, or app_login password for production"
  type        = string
  sensitive   = true
}

variable "db_ssl_enabled" {
  description = "Enable SSL for database connections"
  type        = string
  default     = "true"
}

variable "db_ssl_reject_unauthorized" {
  description = "Reject self-signed DB certs. Set to false for AWS RDS (uses self-signed cert)"
  type        = string
  default     = "false"
}

variable "db_ssl_enabled" {
  description = "Enable SSL for database connections"
  type        = string
  default     = "true"
}

# ---- Redis (from ElastiCache outputs) ----
variable "redis_host" {
  description = "Redis hostname — typically from module.elasticache.hostname"
  type        = string
}

variable "redis_port" {
  description = "Redis port (6379)"
  type        = number
}

variable "redis_password" {
  description = "Redis auth token — empty string when transit encryption is disabled"
  type        = string
  default     = ""
  sensitive   = true
}

variable "redis_tls" {
  description = "Whether Redis uses TLS"
  type        = bool
  default     = false
}

# ---- JWT (sensitive, from tfvars) ----
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

# ---- S3 (from tfvars or IAM role) ----
variable "s3_region" {
  description = "S3 region"
  type        = string
  default     = "eu-central-1"
}

variable "s3_access_key" {
  description = "S3 access key — use IAM task role for ECS and leave empty"
  type        = string
  default     = ""
  sensitive   = true
}

variable "s3_secret_key" {
  description = "S3 secret key — use IAM task role for ECS and leave empty"
  type        = string
  default     = ""
  sensitive   = true
}

variable "s3_quarantine_bucket" {
  description = "Quarantine bucket name — typically from module.s3"
  type        = string
}

variable "s3_clean_bucket" {
  description = "Clean bucket name — typically from module.s3"
  type        = string
}

# ---- App config ----
variable "cors_origins" {
  description = "CORS allowed origins (comma-separated)"
  type        = string
}

variable "s3_endpoint" {
  description = "S3 endpoint URL — empty for AWS S3, set for MinIO/localstack"
  type        = string
  default     = ""
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

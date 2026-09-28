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

variable "bull_board_admin_secret" {
  description = "Bull Board shared secret (API internal port). Required; the API refuses to boot in production without it. Generate with: openssl rand -hex 32"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.bull_board_admin_secret) >= 32
    error_message = "bull_board_admin_secret must be at least 32 characters (openssl rand -hex 32)."
  }
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
  description = "CORS allowed origins (comma-separated): the web app's origin(s), not the API's"
  type        = string
}

variable "frontend_url" {
  description = "The web app's base URL (https). Email links and SSO redirects point here; the API refuses to boot without it."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+", var.frontend_url))
    error_message = "frontend_url must be an https URL, e.g. https://app-staging.complytude.com"
  }
}

variable "openai_api_key" {
  description = "OpenAI API key — required for worker-ai and worker-ingestion"
  type        = string
  default     = ""
  sensitive   = true
}

variable "cohere_api_key" {
  description = "Cohere API key — required for worker-ai reranking"
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

variable "ecs_worker_generation_desired_count" {
  description = "Desired number of worker-generation tasks"
  type        = number
  default     = 1
}

# ---- Worker AI Configuration ----
variable "worker_ai_concurrency" {
  description = "Max concurrent jobs for worker-ai"
  type        = number
  default     = 5
}

variable "worker_ai_max_retries" {
  description = "Max retries per worker-ai job"
  type        = number
  default     = 3
}

variable "worker_ai_retry_delay" {
  description = "Retry delay in ms for worker-ai jobs"
  type        = number
  default     = 5000
}

variable "worker_ai_max_processing_time" {
  description = "Max processing time in ms per worker-ai job"
  type        = number
  default     = 300000
}

variable "openai_chat_model" {
  description = "OpenAI chat model for compliance analysis"
  type        = string
  default     = "gpt-4o-mini"
}

variable "openai_chat_max_tokens" {
  description = "Max output tokens for OpenAI chat completion"
  type        = number
  default     = 4096
}

variable "openai_chat_temperature" {
  description = "Temperature for OpenAI chat completion (0.0-2.0)"
  type        = number
  default     = 0.1
}

variable "openai_chat_timeout" {
  description = "Timeout in ms for OpenAI chat API calls"
  type        = number
  default     = 120000
}

variable "openai_embedding_model" {
  description = "OpenAI embedding model"
  type        = string
  default     = "text-embedding-3-small"
}

variable "openai_embedding_dimensions" {
  description = "Embedding vector dimensions"
  type        = number
  default     = 1536
}

variable "openai_max_retries" {
  description = "Max retries for OpenAI API calls"
  type        = number
  default     = 3
}

variable "embedding_chunk_size" {
  description = "Token size per embedding chunk"
  type        = number
  default     = 512
}

variable "embedding_chunk_overlap" {
  description = "Token overlap between embedding chunks"
  type        = number
  default     = 50
}

variable "cohere_rerank_model" {
  description = "Cohere rerank model"
  type        = string
  default     = "rerank-v3.5"
}

variable "rerank_top_n" {
  description = "Number of top chunks to keep after Cohere reranking (passed to LLM)"
  type        = number
  default     = 25
}

variable "rag_top_k_per_query" {
  description = "Top-K vector results per query embedding in hybrid search"
  type        = number
  default     = 5
}

variable "rag_vector_limit" {
  description = "Max deduplicated vector results before RRF merge"
  type        = number
  default     = 30
}

variable "rag_bm25_limit" {
  description = "Max BM25 full-text results before RRF merge"
  type        = number
  default     = 30
}

variable "rag_max_hybrid_results" {
  description = "Max chunks after RRF merge (fed to reranker)"
  type        = number
  default     = 40
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

# ---- OAuth2 SSO (optional — leave empty to disable) ----
variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_callback_url" {
  description = "Google OAuth redirect URI (e.g. https://api-staging.complytude.com/api/v1/auth/google/callback)"
  type        = string
  default     = ""
}

variable "microsoft_client_id" {
  description = "Microsoft OAuth application (client) ID"
  type        = string
  default     = ""
}

variable "microsoft_client_secret" {
  description = "Microsoft OAuth client secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "microsoft_callback_url" {
  description = "Microsoft OAuth redirect URI"
  type        = string
  default     = ""
}

variable "microsoft_tenant_id" {
  description = "Microsoft tenant: 'common' for multi-tenant, or a directory ID"
  type        = string
  default     = "common"
}

variable "sso_frontend_success_path" {
  description = "Path appended to FRONTEND_URL after successful OAuth"
  type        = string
  default     = "/auth/callback"
}

variable "sso_frontend_error_path" {
  description = "Path appended to FRONTEND_URL on OAuth error"
  type        = string
  default     = "/auth/error"
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

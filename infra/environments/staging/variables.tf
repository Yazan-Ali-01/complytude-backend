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

variable "bastion_key_name" {
  description = "EC2 key pair for bastion SSH, only if SSH is still wanted (null = none: use SSM Session Manager)"
  type        = string
  default     = null
}

variable "bastion_ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH to the bastion (empty = port 22 closed: use SSM Session Manager)"
  type        = list(string)
  default     = []
}

# ---- Application database login (its password is in the db-app secret) ----
variable "app_db_user" {
  description = "Application DB user — use app_login (run setup-app-user-role.sql first) or postgres for quick dev"
  type        = string
  default     = "app_login"
}

variable "s3_endpoint" {
  description = "S3 endpoint URL — empty for AWS S3"
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "CORS allowed origins (comma-separated https origins): the web app's origin(s), not the API's; also the Stripe redirect allowlist"
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

variable "stripe_publishable_key" {
  description = "Stripe publishable key"
  type        = string
  default     = ""
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
  description = "Git SHA (image tag in ECR) the services are first created with; deploys and rollbacks then use scripts/deploy/ecs-deploy.sh"
  type        = string
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
variable "developers_identity_center_group_id" {
  description = "IAM Identity Center group id for developer access (null until Identity Center is enabled and the group exists)"
  type        = string
  default     = null
}

# ---- Monitoring ----
variable "alarm_email" {
  description = "Email for CloudWatch alarm notifications. Set in terraform.tfvars. Must confirm SNS subscription after first apply."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose staging-environment jobs may deploy (OIDC)"
  type        = string
  default     = "Yazan-Ali-01/complytude-backend"
}

variable "stripe_mode" {
  description = "Stripe account mode the keys belong to: test (staging) or live"
  type        = string
  default     = "test"

  validation {
    condition     = contains(["test", "live"], var.stripe_mode)
    error_message = "stripe_mode must be test or live."
  }
}

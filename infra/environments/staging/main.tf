terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = "default"

  default_tags {
    tags = {
      Environment = "staging"
      Project     = "complytude"
      ManagedBy   = "terraform"
    }
  }
}

# Route 53 health-check metrics (the external uptime alarm) exist only in us-east-1
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = "default"
}

# Bull Board's internal port in the API task; opened to the bastion only
locals {
  bull_board_port = 3010
}

module "networking" {
  source = "../../modules/networking"

  project_name       = var.project
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "rds" {
  source = "../../modules/rds"

  project_name      = var.project
  environment       = var.environment
  subnet_ids        = module.networking.public_subnet_ids
  security_group_id = module.networking.rds_security_group_id
  db_name           = "complytude"
  db_username       = "postgres"
  instance_class    = "db.t4g.micro" # ~$15/mo — cheapest ARM-based instance

  # Staging-appropriate settings
  multi_az            = false # Single AZ — save ~$15/mo vs Multi-AZ
  deletion_protection = false # Allow destroy in staging
  skip_final_snapshot = true  # No need for a snapshot on destroy
  # Backup storage up to the DB size is free, so a week costs nothing extra
  backup_retention_days = 7
}

module "elasticache" {
  source = "../../modules/elasticache"

  project_name      = var.project
  environment       = var.environment
  subnet_ids        = module.networking.public_subnet_ids
  security_group_id = module.networking.redis_security_group_id

  # Staging: single node to keep the cost down (~$12/mo), so no failover; production uses the
  # module default of 2 nodes. TLS and AUTH on (no extra cost), one day of snapshots.
  engine_version           = "7.0"
  node_type                = "cache.t4g.micro"
  num_cache_clusters       = 1
  apply_immediately        = true
  snapshot_retention_limit = 1
}

module "bastion" {
  source = "../../modules/bastion"

  project_name           = var.project
  environment            = var.environment
  vpc_id                 = module.networking.vpc_id
  subnet_id              = module.networking.public_subnet_ids[0]
  key_name               = var.bastion_key_name
  ssh_allowed_cidrs      = var.bastion_ssh_allowed_cidrs
  rds_security_group_id  = module.networking.rds_security_group_id
  ecs_security_group_id  = module.networking.ecs_security_group_id
  bull_board_port        = local.bull_board_port
}

module "s3" {
  source = "../../modules/s3"

  project_name         = var.project
  environment          = var.environment
  cors_allowed_origins = [for origin in split(",", var.cors_origins) : trimspace(origin) if trimspace(origin) != ""]
}

module "ecr" {
  source = "../../modules/ecr"

  project_name     = var.project
  environment      = var.environment
  repository_names = ["api", "worker-ai", "worker-ingestion", "worker-generation"]
}

module "ses" {
  source = "../../modules/ses"

  project_name = var.project
  environment  = var.environment
  domain_name  = var.domain_name
}

# Secret containers only: issued credentials are put in with scripts/deploy/put-app-secrets.sh,
# never through tfvars (so never in state)
module "secrets" {
  source = "../../modules/secrets"

  project_name   = var.project
  environment    = var.environment
  redis_password = module.elasticache.auth_token == null ? "" : module.elasticache.auth_token
}

module "route53" {
  source = "../../modules/route53"

  project_name = var.project
  environment  = var.environment
  domain_name  = var.domain_name
}

module "acm" {
  source = "../../modules/acm"

  project_name            = var.project
  environment             = var.environment
  domain_name             = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  zone_id                 = module.route53.zone_id
}

module "ecs" {
  source = "../../modules/ecs"

  project_name     = var.project
  environment      = var.environment
  aws_region       = var.aws_region
  vpc_id           = module.networking.vpc_id
  subnet_ids       = module.networking.public_subnet_ids
  ecs_security_group_id = module.networking.ecs_security_group_id
  alb_security_group_id = module.networking.alb_security_group_id
  acm_certificate_arn   = module.acm.certificate_arn

  ecr_repository_urls = module.ecr.repository_urls
  image_tag           = var.ecs_image_tag

  app_secret_arn         = module.secrets.app_secret_arn
  db_app_secret_arn      = module.secrets.db_app_secret_arn
  redis_secret_arn       = module.secrets.redis_secret_arn
  ecs_secrets_policy_arn = module.secrets.ecs_secrets_policy_arn
  ses_send_policy_arn    = module.ses.ses_send_policy_arn
  quarantine_bucket_arn  = module.s3.quarantine_bucket_arn
  clean_bucket_arn       = module.s3.clean_bucket_arn

  # Configuration, not secrets: plain task environment, visible in the task definition
  shared_environment = {
    DB_HOST                    = module.rds.hostname
    DB_PORT                    = tostring(module.rds.port)
    DB_NAME                    = module.rds.db_name
    DB_APP_USER                = var.app_db_user
    DB_SSL_ENABLED             = "true"
    DB_SSL_REJECT_UNAUTHORIZED = "true"
    DB_IDLE_TIMEOUT            = "30000"
    DB_CONNECTION_TIMEOUT      = "2000"

    REDIS_HOST       = module.elasticache.hostname
    REDIS_PORT       = tostring(module.elasticache.port)
    REDIS_TLS        = tostring(module.elasticache.tls_enabled)
    REDIS_DB         = "0"
    REDIS_QUEUE_DB   = "1"
    REDIS_KEY_PREFIX = "complytude:"

    AWS_REGION          = var.aws_region
    S3_REGION           = var.aws_region
    S3_ENDPOINT         = var.s3_endpoint
    S3_FORCE_PATH_STYLE = "false"
    # Quarantine = uploads before scanning and extraction; clean = promoted files and templates
    COMPLYTUDE_FILES_BUCKET_NAME = module.s3.clean_bucket_name
    TEMPLATES_BUCKET_NAME        = module.s3.clean_bucket_name
    QUARANTINE_BUCKET_NAME       = module.s3.quarantine_bucket_name
  }

  api_environment = {
    NODE_ENV      = "production"
    LOG_LEVEL     = "info"
    SERVICE_NAME  = "gateway"
    GOTENBERG_URL = "http://localhost:3100"
    FRONTEND_URL  = var.frontend_url
    # One ALB in front: only its X-Forwarded-For entry is trusted for the client IP
    TRUST_PROXY_HOPS = "1"
    CORS_ORIGINS     = var.cors_origins

    JWT_ACCESS_EXPIRES_IN   = "30m"
    JWT_IDENTITY_EXPIRES_IN = "10m"
    # Refresh tokens live as long as the Redis session (SESSION_MAX_TTL)
    SESSION_MAX_TTL                   = "14d"
    SESSION_IDLE_TIMEOUT              = "72h"
    SESSION_MAX_PER_USER              = "5"
    SESSION_ACTIVITY_THROTTLE_SECONDS = "120"

    MAX_FILE_SIZE          = "10485760"
    TEMPLATE_MAX_FILE_SIZE = "5242880"
    SIGNED_URL_EXPIRES_IN  = "900"

    STRIPE_PUBLISHABLE_KEY      = var.stripe_publishable_key
    STRIPE_CATALOG_SYNC_ENABLED = var.stripe_catalog_sync_enabled
    STRIPE_TAX_ENABLED          = var.stripe_tax_enabled
    BILLING_SCHEDULE_ENABLED    = tostring(var.billing_schedule_enabled)

    FROM_EMAIL    = var.from_email
    FROM_NAME     = var.from_name
    SUPPORT_EMAIL = var.support_email

    # OAuth2 SSO (empty client id = provider off); the client secrets are in the app secret
    GOOGLE_CLIENT_ID          = var.google_client_id
    GOOGLE_CALLBACK_URL       = var.google_callback_url
    MICROSOFT_CLIENT_ID       = var.microsoft_client_id
    MICROSOFT_CALLBACK_URL    = var.microsoft_callback_url
    MICROSOFT_TENANT_ID       = var.microsoft_tenant_id
    SSO_FRONTEND_SUCCESS_PATH = var.sso_frontend_success_path
    SSO_FRONTEND_ERROR_PATH   = var.sso_frontend_error_path
  }
  bull_board_port = local.bull_board_port
  worker_ai_environment = {
    NODE_ENV     = "production"
    LOG_LEVEL    = "info"
    SERVICE_NAME = "worker-ai"

    WORKER_AI_CONCURRENCY         = tostring(var.worker_ai_concurrency)
    WORKER_AI_MAX_RETRIES         = tostring(var.worker_ai_max_retries)
    WORKER_AI_RETRY_DELAY         = tostring(var.worker_ai_retry_delay)
    WORKER_AI_MAX_PROCESSING_TIME = tostring(var.worker_ai_max_processing_time)

    OPENAI_CHAT_MODEL       = var.openai_chat_model
    OPENAI_CHAT_MAX_TOKENS  = tostring(var.openai_chat_max_tokens)
    OPENAI_CHAT_TEMPERATURE = tostring(var.openai_chat_temperature)
    OPENAI_CHAT_TIMEOUT     = tostring(var.openai_chat_timeout)

    OPENAI_EMBEDDING_MODEL      = var.openai_embedding_model
    OPENAI_EMBEDDING_DIMENSIONS = tostring(var.openai_embedding_dimensions)
    OPENAI_MAX_RETRIES          = tostring(var.openai_max_retries)
    EMBEDDING_CHUNK_SIZE        = tostring(var.embedding_chunk_size)
    EMBEDDING_CHUNK_OVERLAP     = tostring(var.embedding_chunk_overlap)

    COHERE_RERANK_MODEL = var.cohere_rerank_model
    RERANK_TOP_N        = tostring(var.rerank_top_n)

    RAG_TOP_K_PER_QUERY    = tostring(var.rag_top_k_per_query)
    RAG_VECTOR_LIMIT       = tostring(var.rag_vector_limit)
    RAG_BM25_LIMIT         = tostring(var.rag_bm25_limit)
    RAG_MAX_HYBRID_RESULTS = tostring(var.rag_max_hybrid_results)
  }
  worker_ingestion_environment = {
    NODE_ENV      = "production"
    LOG_LEVEL     = "info"
    SERVICE_NAME  = "worker-ingestion"
    # Promote an upload to the clean bucket only once GuardDuty has tagged it clean
    MALWARE_SCAN_REQUIRED = tostring(module.s3.malware_protection_enabled)
  }
  worker_generation_environment = {
    NODE_ENV       = "production"
    LOG_LEVEL      = "info"
    SERVICE_NAME   = "worker-generation"
    GOTENBERG_URL  = "http://localhost:3100"
  }

  api_desired_count               = var.ecs_api_desired_count
  worker_ai_desired_count         = var.ecs_worker_ai_desired_count
  worker_ingestion_desired_count  = var.ecs_worker_ingestion_desired_count
  worker_generation_desired_count = var.ecs_worker_generation_desired_count
}

module "dns_record" {
  source = "../../modules/route53-record"

  zone_id      = module.route53.zone_id
  record_name  = "api-staging"
  alb_dns_name = module.ecs.alb_dns_name
  alb_zone_id  = module.ecs.alb_zone_id
}

module "developers" {
  source = "../../modules/developers"

  project_name        = var.project
  environment         = var.environment
  developer_usernames = var.developer_usernames
  s3_bucket_arns      = [module.s3.quarantine_bucket_arn, module.s3.clean_bucket_arn]
}

module "monitoring" {
  source = "../../modules/monitoring"

  project_name         = var.project
  environment          = var.environment
  ecs_cluster_name     = module.ecs.cluster_name
  ecs_service_names   = [
    module.ecs.api_service_name,
    module.ecs.worker_ai_service_name,
    module.ecs.worker_ingestion_service_name,
    module.ecs.worker_generation_service_name,
  ]
  rds_instance_id              = module.rds.instance_id
  redis_replication_group_id   = module.elasticache.replication_group_id
  alarm_emails                 = [var.alarm_email]
  alb_arn_suffix               = module.ecs.alb_arn_suffix
  api_target_group_arn_suffix  = module.ecs.api_target_group_arn_suffix
  log_group_names              = module.ecs.log_group_names
  api_fqdn                     = "api-staging.${var.domain_name}"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
}

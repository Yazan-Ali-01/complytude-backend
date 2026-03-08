terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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
  db_password       = var.db_password
  instance_class    = "db.t4g.micro" # ~$15/mo — cheapest ARM-based instance

  # Staging-appropriate settings
  multi_az            = false # Single AZ — save ~$15/mo vs Multi-AZ
  deletion_protection = false # Allow destroy in staging
  skip_final_snapshot = true  # No need for a snapshot on destroy
}

module "elasticache" {
  source = "../../modules/elasticache"

  project_name      = var.project
  environment       = var.environment
  subnet_ids        = module.networking.public_subnet_ids
  security_group_id = module.networking.redis_security_group_id

  # Staging: single node, minimal cost (~$12/mo)
  engine_version       = "7.0"
  node_type            = "cache.t4g.micro"
  num_cache_clusters   = 1
  apply_immediately    = true
  transit_encryption_enabled = false # No TLS in staging; VPC + SG sufficient
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
}

module "s3" {
  source = "../../modules/s3"

  project_name = var.project
  environment  = var.environment
}

module "ecr" {
  source = "../../modules/ecr"

  project_name     = var.project
  environment      = var.environment
  repository_names = ["api", "worker-ai", "worker-ingestion"]
}

module "secrets" {
  source = "../../modules/secrets"

  project_name = var.project
  environment  = var.environment

  # Database — from RDS
  db_host        = module.rds.hostname
  db_port        = module.rds.port
  db_name        = module.rds.db_name
  db_app_user     = var.app_db_user
  db_app_password = var.app_db_password

  # Redis — from ElastiCache
  redis_host    = module.elasticache.hostname
  redis_port    = module.elasticache.port
  redis_password = var.redis_password
  redis_tls     = var.redis_tls

  # JWT — from tfvars (sensitive)
  jwt_access_secret          = var.jwt_access_secret
  jwt_refresh_secret        = var.jwt_refresh_secret
  jwt_identity_secret       = var.jwt_identity_secret
  jwt_identity_refresh_secret = var.jwt_identity_refresh_secret
  jwt_refresh_hash_secret   = var.jwt_refresh_hash_secret

  # S3 — from tfvars + module
  s3_region             = var.aws_region
  s3_access_key         = var.s3_access_key
  s3_secret_key         = var.s3_secret_key
  s3_quarantine_bucket  = module.s3.quarantine_bucket_name
  s3_clean_bucket       = module.s3.clean_bucket_name
  s3_endpoint           = var.s3_endpoint

  # App
  cors_origins = var.cors_origins

  # OpenAI (for workers)
  openai_api_key = var.openai_api_key

  # Stripe
  stripe_secret_key          = var.stripe_secret_key
  stripe_publishable_key     = var.stripe_publishable_key
  stripe_webhook_secret      = var.stripe_webhook_secret
  stripe_catalog_sync_enabled = var.stripe_catalog_sync_enabled
  stripe_tax_enabled         = var.stripe_tax_enabled
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

  secret_arn           = module.secrets.secret_arn
  ecs_secrets_policy_arn = module.secrets.ecs_secrets_policy_arn
  s3_bucket_arns = [
    module.s3.quarantine_bucket_arn,
    module.s3.clean_bucket_arn,
  ]

  api_environment = {
    NODE_ENV = "production"
  }
  worker_ai_environment = {
    NODE_ENV = "production"
  }
  worker_ingestion_environment = {
    NODE_ENV = "production"
  }

  api_desired_count            = var.ecs_api_desired_count
  worker_ai_desired_count      = var.ecs_worker_ai_desired_count
  worker_ingestion_desired_count = var.ecs_worker_ingestion_desired_count
}

module "dns_record" {
  source = "../../modules/route53-record"

  zone_id      = module.route53.zone_id
  record_name  = "staging"
  alb_dns_name = module.ecs.alb_dns_name
  alb_zone_id  = module.ecs.alb_zone_id
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
  ]
  rds_instance_id              = module.rds.instance_id
  redis_replication_group_id   = module.elasticache.replication_group_id
  alarm_email                  = var.alarm_email
}

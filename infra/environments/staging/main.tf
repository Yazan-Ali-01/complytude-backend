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
  region = var.aws_region

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

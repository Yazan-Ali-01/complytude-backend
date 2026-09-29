variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment (staging, production)"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, as owner/name"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Give the repository as owner/name."
  }
}

variable "github_environment" {
  description = "GitHub environment the deploying jobs run in; only those jobs get the role (its protection rules decide which branches and who may deploy)"
  type        = string
}

variable "create_oidc_provider" {
  description = "Create the account's GitHub OIDC provider (one per account: false for a second environment in the same account)"
  type        = bool
  default     = true
}

variable "ecr_repository_arns" {
  description = "ECR repositories the pipeline pushes to and reads digests from"
  type        = list(string)
}

variable "ecs_service_arns" {
  description = "ECS services the pipeline may update"
  type        = list(string)
}

variable "passable_role_arns" {
  description = "Execution and task roles a registered task definition may name"
  type        = list(string)
}

variable "rds_instance_arn" {
  description = "RDS instance the migration step looks up"
  type        = string
}

variable "migration_secret_arns" {
  description = "Secrets the migration step reads (RDS master secret, db-app secret); never the app secret"
  type        = list(string)
}

variable "bastion_instance_arn" {
  description = "Bastion instance the migration step port-forwards through (SSM)"
  type        = string
}

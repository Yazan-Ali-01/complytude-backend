variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "me-central-1"
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
  default     = ["me-central-1a", "me-central-1c"]
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

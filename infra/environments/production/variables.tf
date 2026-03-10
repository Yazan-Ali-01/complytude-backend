variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "me-central-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "complytude"
}

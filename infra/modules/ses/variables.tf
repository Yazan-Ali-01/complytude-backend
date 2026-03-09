variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "domain_name" {
  description = "Domain name for SES identity (e.g., complytude.com)"
  type        = string
}

variable "from_email" {
  description = "From email address for sending emails (e.g., billing@complytude.com)"
  type        = string
}

variable "support_email" {
  description = "Support email address (e.g., support@complytude.com)"
  type        = string
}
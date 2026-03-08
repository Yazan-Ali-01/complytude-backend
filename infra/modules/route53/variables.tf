variable "project_name" {
  description = "Project name for tagging"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "domain_name" {
  description = "Root domain (e.g. complytude.com)"
  type        = string
}

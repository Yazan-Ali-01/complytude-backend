variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "repository_names" {
  description = "List of ECR repository names (one per app)"
  type        = list(string)
  default     = ["api", "worker-ai", "worker-ingestion"]
}

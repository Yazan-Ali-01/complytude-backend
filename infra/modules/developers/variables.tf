variable "project_name" {
  description = "Project name (used for resource naming)"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g. staging, production)"
  type        = string
}

variable "developer_usernames" {
  description = "List of IAM usernames to create for developers (e.g. [\"john\", \"alice\"])"
  type        = list(string)
  default     = []
}

variable "s3_bucket_arns" {
  description = "ARNs of S3 buckets developers can read (staging file + clean buckets)"
  type        = list(string)
}

variable "secret_arn" {
  description = "ARN of the Secrets Manager secret developers can read (staging app secret)"
  type        = string
}

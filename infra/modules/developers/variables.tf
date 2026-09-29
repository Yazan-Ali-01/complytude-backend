variable "project_name" {
  description = "Project name (used for resource naming)"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g. staging, production)"
  type        = string
}

variable "identity_center_group_id" {
  description = "IAM Identity Center group whose members get developer access (null = not set up yet; nothing is created)"
  type        = string
  default     = null
}

variable "s3_bucket_arns" {
  description = "ARNs of S3 buckets developers can read (staging quarantine + clean buckets)"
  type        = list(string)
}

variable "bastion_instance_arn" {
  description = "Bastion developers may port-forward through (SSM Session Manager)"
  type        = string
}

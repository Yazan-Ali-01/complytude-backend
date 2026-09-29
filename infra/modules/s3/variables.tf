variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "noncurrent_version_days" {
  description = "Days an overwritten or deleted object's previous version can be restored"
  type        = number
  default     = 30
}

variable "quarantine_expiration_days" {
  description = "Days an upload may stay in quarantine before it expires (confirmed uploads leave within minutes)"
  type        = number
  default     = 2
}

variable "enable_malware_protection" {
  description = "Scan every upload to the quarantine bucket with GuardDuty Malware Protection; the ingestion worker promotes only files tagged clean"
  type        = bool
  default     = true
}

variable "cors_allowed_origins" {
  description = "Frontend origins allowed to PUT uploads to the quarantine bucket with presigned URLs"
  type        = list(string)
  default     = []
}

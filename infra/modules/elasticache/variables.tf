variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the ElastiCache subnet group (at least 2 AZs required)"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for Redis (allow port 6379 from app)"
  type        = string
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "node_type" {
  description = "ElastiCache node type (e.g. cache.t4g.micro for staging)"
  type        = string
  default     = "cache.t4g.micro"
}

variable "num_cache_clusters" {
  description = "Number of cache clusters (1 = single node, 2+ = primary + replicas)"
  type        = number
  default     = 1

  validation {
    condition     = var.num_cache_clusters >= 1 && var.num_cache_clusters <= 6
    error_message = "num_cache_clusters must be between 1 and 6."
  }
}

variable "apply_immediately" {
  description = "Apply changes immediately (true for staging, false for production)"
  type        = bool
  default     = true
}

variable "transit_encryption_enabled" {
  description = "Enable TLS in-transit encryption (requires auth_token when true)"
  type        = bool
  default     = false
}

variable "auth_token" {
  description = "Auth token for Redis (required when transit_encryption_enabled = true). 16-128 chars, alphanumeric + !&#$^<>-"
  type        = string
  default     = null
  sensitive   = true
}

variable "maintenance_window" {
  description = "Maintenance window (e.g. sun:04:00-sun:05:00)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "snapshot_window" {
  description = "Daily snapshot window"
  type        = string
  default     = "03:00-04:00"
}

variable "snapshot_retention_limit" {
  description = "Number of days to retain snapshots (0 = disabled)"
  type        = number
  default     = 0
}

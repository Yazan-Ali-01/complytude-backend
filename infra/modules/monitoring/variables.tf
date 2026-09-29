variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster name for alarm dimensions"
  type        = string
}

variable "ecs_service_names" {
  description = "List of ECS service names to monitor"
  type        = list(string)
}

variable "rds_instance_id" {
  description = "RDS instance identifier for alarm dimensions"
  type        = string
}

variable "redis_replication_group_id" {
  description = "ElastiCache replication group ID for Redis alarms. Set to null to skip Redis alarms."
  type        = string
  default     = null
}

variable "alarm_emails" {
  description = "Addresses notified by every alarm (each must confirm the subscription email after apply); prefer a shared on-call address"
  type        = list(string)

  validation {
    condition     = length(var.alarm_emails) > 0
    error_message = "At least one alarm subscriber is required."
  }
}

variable "rds_connections_threshold" {
  description = "RDS DatabaseConnections threshold - alarm when exceeded"
  type        = number
  default     = 40 # db.t4g.micro max ~85
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix (from the ecs module)"
  type        = string
}

variable "api_target_group_arn_suffix" {
  description = "API target group ARN suffix (from the ecs module)"
  type        = string
}

variable "log_group_names" {
  description = "Log group per app (from the ecs module); must include \"api\""
  type        = map(string)
}

variable "api_fqdn" {
  description = "Public API hostname for the external uptime check (null disables it)"
  type        = string
  default     = null
}

variable "queue_names" {
  description = "BullMQ queues to alarm on"
  type        = list(string)
  default = [
    "ai-processing",
    "data-ingestion",
    "entitlement-processing",
    "billing-processing",
    "tenant-processing",
    "document-generation",
  ]
}

variable "http_5xx_threshold" {
  description = "5xx responses in 5 minutes before alarming"
  type        = number
  default     = 10
}

variable "api_p95_latency_seconds" {
  description = "p95 API response time (seconds) before alarming"
  type        = number
  default     = 2
}

variable "error_log_threshold" {
  description = "Error-level log lines per app in 5 minutes before alarming"
  type        = number
  default     = 20
}

variable "queue_backlog_threshold" {
  description = "Waiting jobs per queue (sustained 15 minutes) before alarming"
  type        = number
  default     = 500
}

variable "queue_oldest_waiting_seconds" {
  description = "Age of the oldest waiting job before alarming (consumer stopped)"
  type        = number
  default     = 900
}

variable "queue_failed_threshold" {
  description = "Jobs failed for good per queue in 5 minutes before alarming"
  type        = number
  default     = 5
}

variable "ses_bounce_rate_threshold" {
  description = "SES bounce rate (0–1) that raises the alarm; SES reviews the account at 0.05"
  type        = number
  default     = 0.03
}

variable "ses_complaint_rate_threshold" {
  description = "SES complaint rate (0–1) that raises the alarm; SES reviews the account at 0.001"
  type        = number
  default     = 0.0005
}

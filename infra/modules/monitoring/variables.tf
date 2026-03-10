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

variable "alarm_email" {
  description = "Email address for alarm notifications. Must confirm subscription after apply."
  type        = string
}

variable "rds_connections_threshold" {
  description = "RDS DatabaseConnections threshold - alarm when exceeded"
  type        = number
  default     = 40 # db.t4g.micro max ~85
}

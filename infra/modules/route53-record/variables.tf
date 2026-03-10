variable "zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
}

variable "record_name" {
  description = "Record name within the zone (e.g. staging for staging.complytude.com in zone complytude.com)"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name for ALIAS target"
  type        = string
}

variable "alb_zone_id" {
  description = "ALB hosted zone ID for ALIAS target"
  type        = string
}

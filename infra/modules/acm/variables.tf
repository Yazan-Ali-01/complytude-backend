variable "project_name" {
  description = "Project name for tagging"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "domain_name" {
  description = "Primary domain for the certificate (e.g. staging.complytude.com)"
  type        = string
}

variable "subject_alternative_names" {
  description = "Additional domains for the certificate (e.g. *.complytude.com)"
  type        = list(string)
  default     = []
}

variable "zone_id" {
  description = "Route 53 hosted zone ID for DNS validation"
  type        = string
}

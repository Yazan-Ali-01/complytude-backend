variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "domain_name" {
  description = "Domain name for SES identity (e.g., complytude.com)"
  type        = string
}

variable "zone_id" {
  description = "Route 53 zone of domain_name; the verification, DKIM, MAIL FROM and DMARC records are created there (null = manage DNS elsewhere)"
  type        = string
  default     = null
}

variable "dmarc_policy" {
  description = "DMARC policy for the domain: none (reports only), quarantine or reject; null = don't publish a DMARC record"
  type        = string
  default     = "none"

  validation {
    condition     = var.dmarc_policy == null || contains(["none", "quarantine", "reject"], coalesce(var.dmarc_policy, "none"))
    error_message = "dmarc_policy must be none, quarantine or reject."
  }
}

variable "dmarc_report_email" {
  description = "Address that receives DMARC aggregate reports (null = no reports)"
  type        = string
  default     = null
}

variable "feedback_emails" {
  description = "Addresses subscribed to the bounce/complaint SNS topic (each must confirm the subscription)"
  type        = list(string)
  default     = []
}

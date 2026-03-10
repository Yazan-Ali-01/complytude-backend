variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment (staging, production)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID to launch bastion in"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet ID (first AZ is fine)"
  type        = string
}

variable "key_name" {
  description = "Name of existing EC2 key pair for SSH access"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH to bastion (e.g. [\"YOUR_IP/32\"]). Use 0.0.0.0/0 only for testing."
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "RDS security group ID — bastion will be allowed to connect on 5432"
  type        = string
}

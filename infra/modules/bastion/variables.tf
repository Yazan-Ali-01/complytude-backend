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
  description = "EC2 key pair for SSH, only if SSH is still wanted (null = none; use SSM Session Manager)"
  type        = string
  default     = null
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH to the bastion (empty = port 22 closed; use SSM Session Manager)"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.ssh_allowed_cidrs : !contains(["0.0.0.0/0", "::/0"], c)])
    error_message = "SSH must not be open to the whole internet; give specific /32 addresses or none."
  }
}

variable "ami_id" {
  description = "AMI for the bastion (null = latest Amazon Linux 2023 arm64 at creation; later images don't replace it)"
  type        = string
  default     = null
}

variable "rds_security_group_id" {
  description = "RDS security group ID — bastion will be allowed to connect on 5432"
  type        = string
}

variable "ecs_security_group_id" {
  description = "ECS tasks security group ID — bastion will be allowed to reach Bull Board on bull_board_port"
  type        = string
}

variable "bull_board_port" {
  description = "Bull Board's internal port in the API task (must match the ECS module's bull_board_port)"
  type        = number
  default     = 3010
}

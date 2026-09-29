output "public_ip" {
  description = "Bastion public IP (SSH only if enabled; use instance_id with SSM)"
  value       = aws_instance.bastion.public_ip
}

output "instance_id" {
  description = "Bastion instance id — target of SSM port-forwarding sessions"
  value       = aws_instance.bastion.id
}

output "instance_arn" {
  description = "Bastion instance ARN (for ssm:StartSession permissions)"
  value       = aws_instance.bastion.arn
}

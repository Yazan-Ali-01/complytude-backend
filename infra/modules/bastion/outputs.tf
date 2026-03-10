output "public_ip" {
  description = "Bastion public IP — use for SSH tunnel"
  value       = aws_instance.bastion.public_ip
}

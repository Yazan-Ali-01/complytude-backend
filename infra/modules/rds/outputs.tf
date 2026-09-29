output "endpoint" {
  description = "Full RDS endpoint including port (hostname:port) — use for connection strings"
  value       = aws_db_instance.main.endpoint
}

output "hostname" {
  description = "RDS hostname only — use this as DB_HOST in your app"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "RDS port (5432)"
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "Name of the database"
  value       = aws_db_instance.main.db_name
}

output "db_username" {
  description = "Master username"
  value       = aws_db_instance.main.username
}

output "instance_id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}

output "master_user_secret_arn" {
  description = "ARN of the RDS-managed secret holding the master username and password (for the migration pipeline)"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "instance_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.main.arn
}

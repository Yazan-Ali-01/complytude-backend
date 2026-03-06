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

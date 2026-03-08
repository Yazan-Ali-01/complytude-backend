output "app_fqdn" {
  description = "Fully qualified domain name for the app"
  value       = aws_route53_record.app.fqdn
}

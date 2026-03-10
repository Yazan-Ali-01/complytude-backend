output "zone_id" {
  description = "Route 53 hosted zone ID"
  value       = aws_route53_zone.main.zone_id
}

output "name_servers" {
  description = "Nameservers for domain delegation — set these in Namecheap"
  value       = aws_route53_zone.main.name_servers
}

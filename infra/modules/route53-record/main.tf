# A record (ALIAS) pointing app subdomain to ALB
# Record name is the subdomain part only (e.g. "staging" for staging.complytude.com in zone complytude.com)
resource "aws_route53_record" "app" {
  zone_id = var.zone_id
  name    = var.record_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

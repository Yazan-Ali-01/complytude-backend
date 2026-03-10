# Route 53 hosted zone (zone only — no records)
# Domain must be delegated from Namecheap: set nameservers to the NS records output by this module
# A record for the app is created in route53-record module (after ALB exists)
resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = {
    Name = "${var.project_name}-${var.environment}-zone"
  }
}

# ---- SES Email Service ----
# Configure AWS SES for sending transactional emails (dunning, notifications)

# Domain identity for email sending
resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

# DKIM signing for email authentication
resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# ---- DNS (Route 53, same state) ----
# Without these SES never verifies the domain and mail goes out unsigned or not at all.
locals {
  manage_dns       = var.zone_id != null
  mail_from_domain = "mail.${var.domain_name}"
}

resource "aws_route53_record" "verification" {
  count   = local.manage_dns ? 1 : 0
  zone_id = var.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]
}

resource "aws_ses_domain_identity_verification" "main" {
  count      = local.manage_dns ? 1 : 0
  domain     = aws_ses_domain_identity.main.id
  depends_on = [aws_route53_record.verification]
}

resource "aws_route53_record" "dkim" {
  count   = local.manage_dns ? 3 : 0
  zone_id = var.zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# Custom MAIL FROM: bounces return to mail.<domain>, and SPF is published there, so SPF aligns
# with the From domain (DMARC) without touching the root domain's TXT records
resource "aws_ses_domain_mail_from" "main" {
  domain                 = aws_ses_domain_identity.main.domain
  mail_from_domain       = local.mail_from_domain
  behavior_on_mx_failure = "UseDefaultValue"
}

resource "aws_route53_record" "mail_from_mx" {
  count   = local.manage_dns ? 1 : 0
  zone_id = var.zone_id
  name    = local.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${data.aws_region.current.name}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  count   = local.manage_dns ? 1 : 0
  zone_id = var.zone_id
  name    = local.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com -all"]
}

# DMARC for the domain: starts at p=none (reports only); tighten to quarantine/reject once the
# reports show every legitimate sender passing
resource "aws_route53_record" "dmarc" {
  count   = local.manage_dns && var.dmarc_policy != null ? 1 : 0
  zone_id = var.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [join("; ", compact([
    "v=DMARC1",
    "p=${var.dmarc_policy}",
    var.dmarc_report_email != null ? "rua=mailto:${var.dmarc_report_email}" : "",
    "adkim=s",
    "aspf=r",
  ]))]
}

data "aws_region" "current" {}

# ---- Bounces and complaints ----
# SES keeps the account's suppression list itself: an address that hard-bounced or complained is
# not sent to again (SES drops the message and records a bounce), so repeat sends can't push the
# bounce or complaint rate towards SES's review thresholds.
resource "aws_sesv2_account_suppression_attributes" "main" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

# Every bounce and complaint is also published here, for a handler or subscriber that needs them
resource "aws_sns_topic" "feedback" {
  name = "${var.project_name}-${var.environment}-ses-feedback"

  tags = {
    Name = "${var.project_name}-${var.environment}-ses-feedback"
  }
}

resource "aws_sns_topic_policy" "feedback" {
  arn = aws_sns_topic.feedback.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ses.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.feedback.arn
        Condition = {
          StringEquals = { "AWS:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "feedback_email" {
  for_each  = toset(var.feedback_emails)
  topic_arn = aws_sns_topic.feedback.arn
  protocol  = "email"
  endpoint  = each.value
}

data "aws_caller_identity" "current" {}

# Configuration set for tracking and monitoring
resource "aws_ses_configuration_set" "main" {
  name = "${var.project_name}-${var.environment}"

  delivery_options {
    tls_policy = "Require"
  }

  reputation_metrics_enabled = true
}

# Send, delivery, bounce, complaint and reject counts in CloudWatch, per email type (the app tags
# every message with EmailType); only sends that name the configuration set are counted
resource "aws_ses_event_destination" "cloudwatch" {
  name                   = "cloudwatch-events"
  configuration_set_name = aws_ses_configuration_set.main.name
  enabled                = true
  matching_types         = ["bounce", "complaint", "delivery", "send", "reject"]

  cloudwatch_destination {
    default_value  = "untagged"
    dimension_name = "EmailType"
    value_source   = "messageTag"
  }
}

resource "aws_ses_event_destination" "sns_feedback" {
  name                   = "sns-bounces-complaints"
  configuration_set_name = aws_ses_configuration_set.main.name
  enabled                = true
  matching_types         = ["bounce", "complaint"]

  sns_destination {
    topic_arn = aws_sns_topic.feedback.arn
  }

  depends_on = [aws_sns_topic_policy.feedback]
}

# IAM policy for ECS tasks to send emails
resource "aws_iam_policy" "ses_send_email" {
  name        = "${var.project_name}-${var.environment}-ses-send-email"
  description = "Allows ECS tasks to send emails via SES"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail"
        ]
        # A send naming the configuration set is authorised against the set's ARN too
        Resource = [
          aws_ses_domain_identity.main.arn,
          aws_ses_configuration_set.main.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:GetSendQuota",
          "ses:GetSendStatistics"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-ses-policy"
  }
}
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

# Email address identity for the from address
resource "aws_ses_email_identity" "from_email" {
  email = var.from_email
}

# Email address identity for support email
resource "aws_ses_email_identity" "support_email" {
  email = var.support_email
}

# Configuration set for tracking and monitoring
resource "aws_ses_configuration_set" "main" {
  name = "${var.project_name}-${var.environment}"

  delivery_options {
    tls_policy = "Require"
  }

  reputation_metrics_enabled = true
}

# Event destination for bounce/complaint tracking (optional)
resource "aws_ses_event_destination" "cloudwatch" {
  name                   = "cloudwatch-events"
  configuration_set_name = aws_ses_configuration_set.main.name
  enabled                = true
  matching_types         = ["bounce", "complaint", "delivery", "send", "reject"]

  cloudwatch_destination {
    default_value  = "0"
    dimension_name = "MessageTag"
    value_source   = "messageTag"
  }
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
        Resource = [
          aws_ses_domain_identity.main.arn,
          aws_ses_email_identity.from_email.arn,
          aws_ses_email_identity.support_email.arn,
          "${aws_ses_configuration_set.main.arn}/*"
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
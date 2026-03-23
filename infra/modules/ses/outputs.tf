output "domain_identity_arn" {
  description = "ARN of the SES domain identity"
  value       = aws_ses_domain_identity.main.arn
}

output "domain_identity_verification_token" {
  description = "Domain verification token for DNS setup"
  value       = aws_ses_domain_identity.main.verification_token
}

output "dkim_tokens" {
  description = "DKIM tokens for DNS setup"
  value       = aws_ses_domain_dkim.main.dkim_tokens
}

output "configuration_set_name" {
  description = "Name of the SES configuration set"
  value       = aws_ses_configuration_set.main.name
}

output "ses_send_policy_arn" {
  description = "ARN of the IAM policy for sending emails via SES"
  value       = aws_iam_policy.ses_send_email.arn
}

output "from_email_identity_arn" {
  description = "ARN of the from email identity"
  value       = aws_ses_email_identity.from_email.arn
}

output "support_email_identity_arn" {
  description = "ARN of the support email identity"
  value       = aws_ses_email_identity.support_email.arn
}
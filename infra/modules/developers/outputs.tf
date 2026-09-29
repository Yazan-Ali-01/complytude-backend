output "permission_set_arn" {
  description = "Developer permission set in IAM Identity Center (null until identity_center_group_id is set)"
  value       = local.enabled ? aws_ssoadmin_permission_set.developer[0].arn : null
}

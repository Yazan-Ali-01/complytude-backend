output "access_keys" {
  description = "AWS access key ID and secret for each developer. Run: terraform output -json developer_access_keys"
  sensitive   = true
  value = {
    for username in var.developer_usernames : username => {
      access_key_id     = aws_iam_access_key.developer[username].id
      secret_access_key = aws_iam_access_key.developer[username].secret
    }
  }
}

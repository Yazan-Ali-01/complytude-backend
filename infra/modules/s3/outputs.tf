output "quarantine_bucket_name" {
  description = "Name of the quarantine S3 bucket"
  value       = aws_s3_bucket.quarantine.bucket
}

output "clean_bucket_name" {
  description = "Name of the clean S3 bucket"
  value       = aws_s3_bucket.clean.bucket
}

output "quarantine_bucket_arn" {
  description = "ARN of the quarantine S3 bucket"
  value       = aws_s3_bucket.quarantine.arn
}

output "clean_bucket_arn" {
  description = "ARN of the clean S3 bucket"
  value       = aws_s3_bucket.clean.arn
}

output "malware_protection_enabled" {
  description = "Whether uploads to the quarantine bucket are scanned (the ingestion worker must then require a clean scan)"
  value       = var.enable_malware_protection
}

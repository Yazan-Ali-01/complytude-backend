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

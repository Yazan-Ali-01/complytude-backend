data "aws_caller_identity" "current" {}

# Quarantine bucket (uploaded files go here first)
resource "aws_s3_bucket" "quarantine" {
  bucket = "${var.project_name}-${var.environment}-quarantine"

  tags = {
    Name        = "${var.project_name}-${var.environment}-quarantine"
    Environment = var.environment
  }
}

# Clean bucket (files moved here after validation)
resource "aws_s3_bucket" "clean" {
  bucket = "${var.project_name}-${var.environment}-clean"

  tags = {
    Name        = "${var.project_name}-${var.environment}-clean"
    Environment = var.environment
  }
}

# Block all public access on both buckets
resource "aws_s3_bucket_public_access_block" "quarantine" {
  bucket                  = aws_s3_bucket.quarantine.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "clean" {
  bucket                  = aws_s3_bucket.clean.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "quarantine" {
  bucket = aws_s3_bucket.quarantine.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "clean" {
  bucket = aws_s3_bucket.clean.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Async Textract reads the object from S3 using the service principal (not the ECS task role).
resource "aws_s3_bucket_policy" "quarantine_textract" {
  bucket = aws_s3_bucket.quarantine.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowTextractGetObject"
        Effect = "Allow"
        Principal = {
          Service = "textract.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.quarantine.arn}/*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

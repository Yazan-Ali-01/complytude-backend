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

# ---- Versioning ----
# An overwritten or deleted object (a bad deploy, a bug, a mistaken delete) can be restored from
# its previous version; see "Backups and restore" in docs/DEPLOYMENT.md.
resource "aws_s3_bucket_versioning" "quarantine" {
  bucket = aws_s3_bucket.quarantine.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "clean" {
  bucket = aws_s3_bucket.clean.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ---- Lifecycle ----
# Previous versions are kept for noncurrent_version_days, then removed (so a deleted document is
# really gone after that window); expired delete markers and abandoned multipart uploads are
# cleaned up.
resource "aws_s3_bucket_lifecycle_configuration" "quarantine" {
  bucket     = aws_s3_bucket.quarantine.id
  depends_on = [aws_s3_bucket_versioning.quarantine]

  # Files wait here only until ingestion promotes them (minutes): anything older was never
  # confirmed, or failed ingestion for good (its document row is failed or removed)
  rule {
    id     = "expire-unpromoted-uploads"
    status = "Enabled"
    filter {}

    expiration {
      days = var.quarantine_expiration_days
    }
  }

  rule {
    id     = "noncurrent-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }
    expiration {
      expired_object_delete_marker = true
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "clean" {
  bucket     = aws_s3_bucket.clean.id
  depends_on = [aws_s3_bucket_versioning.clean]

  # Watermarked previews: their signed URL lasts an hour, nothing references them afterwards
  rule {
    id     = "expire-previews"
    status = "Enabled"
    filter {
      prefix = "previews/"
    }

    expiration {
      days = 1
    }
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  rule {
    id     = "noncurrent-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }
    expiration {
      expired_object_delete_marker = true
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Browsers upload straight to the quarantine bucket with presigned PUT URLs
resource "aws_s3_bucket_cors_configuration" "quarantine" {
  count  = length(var.cors_allowed_origins) > 0 ? 1 : 0
  bucket = aws_s3_bucket.quarantine.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["Content-Type", "Content-Length"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Every upload is scanned; GuardDuty tags the object with GuardDutyMalwareScanStatus
# (NO_THREATS_FOUND, THREATS_FOUND, ...). The ingestion worker promotes only NO_THREATS_FOUND.
resource "aws_guardduty_malware_protection_plan" "quarantine" {
  count = var.enable_malware_protection ? 1 : 0
  role  = aws_iam_role.malware_protection[0].arn

  protected_resource {
    s3_bucket {
      bucket_name = aws_s3_bucket.quarantine.bucket
    }
  }

  actions {
    tagging {
      status = "ENABLED"
    }
  }

  tags = {
    Environment = var.environment
  }

  depends_on = [aws_iam_role_policy.malware_protection]
}

resource "aws_iam_role" "malware_protection" {
  count = var.enable_malware_protection ? 1 : 0
  name  = "${var.project_name}-${var.environment}-malware-protection"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "malware-protection-plan.guardduty.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

# The permissions GuardDuty documents for a Malware Protection for S3 plan
resource "aws_iam_role_policy" "malware_protection" {
  count = var.enable_malware_protection ? 1 : 0
  name  = "malware-protection"
  role  = aws_iam_role.malware_protection[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageEventBridgeRule"
        Effect = "Allow"
        Action = [
          "events:PutRule",
          "events:DeleteRule",
          "events:PutTargets",
          "events:RemoveTargets",
          "events:DescribeRule",
          "events:ListTargetsByRule",
        ]
        Resource = "arn:aws:events:*:${data.aws_caller_identity.current.account_id}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*"
        Condition = {
          StringLike = { "events:ManagedBy" = "malware-protection-plan.guardduty.amazonaws.com" }
        }
      },
      {
        Sid      = "AllowPostScanTag"
        Effect   = "Allow"
        Action   = ["s3:PutObjectTagging", "s3:GetObjectTagging", "s3:PutObjectVersionTagging", "s3:GetObjectVersionTagging"]
        Resource = "${aws_s3_bucket.quarantine.arn}/*"
      },
      {
        Sid      = "AllowEnableS3EventBridgeEvents"
        Effect   = "Allow"
        Action   = ["s3:PutBucketNotification", "s3:GetBucketNotification"]
        Resource = aws_s3_bucket.quarantine.arn
      },
      {
        Sid      = "AllowPutValidationObject"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.quarantine.arn}/malware-protection-resource-validation-object"
      },
      {
        Sid      = "AllowCheckBucketOwnership"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.quarantine.arn
      },
      {
        Sid      = "AllowMalwareScan"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource = "${aws_s3_bucket.quarantine.arn}/*"
      },
    ]
  })
}

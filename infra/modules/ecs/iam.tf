# ---- Task Execution Role ----
# Permissions ECS needs to START containers: pull image from ECR, read secrets.
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-${var.environment}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-task-execution"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Attach secrets policy from secrets module — allows reading app secrets
resource "aws_iam_role_policy_attachment" "ecs_secrets" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = var.ecs_secrets_policy_arn
}

# ---- Task roles ----
# One per service, with only what that service calls: a worker compromised through a document can't
# send email, and the API can't run Textract or rewrite the promoted files' scan tags.
locals {
  task_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
      }
    ]
  })
  quarantine_objects = "${var.quarantine_bucket_arn}/*"
  clean_objects      = "${var.clean_bucket_arn}/*"
}

resource "aws_iam_role" "api_task" {
  name               = "${var.project_name}-${var.environment}-api-task"
  assume_role_policy = local.task_assume_role_policy
  tags               = { Name = "${var.project_name}-${var.environment}-api-task" }
}

resource "aws_iam_role" "worker_ai_task" {
  name               = "${var.project_name}-${var.environment}-worker-ai-task"
  assume_role_policy = local.task_assume_role_policy
  tags               = { Name = "${var.project_name}-${var.environment}-worker-ai-task" }
}

resource "aws_iam_role" "worker_ingestion_task" {
  name               = "${var.project_name}-${var.environment}-worker-ingestion-task"
  assume_role_policy = local.task_assume_role_policy
  tags               = { Name = "${var.project_name}-${var.environment}-worker-ingestion-task" }
}

resource "aws_iam_role" "worker_generation_task" {
  name               = "${var.project_name}-${var.environment}-worker-generation-task"
  assume_role_policy = local.task_assume_role_policy
  tags               = { Name = "${var.project_name}-${var.environment}-worker-generation-task" }
}

# worker-ai: OpenAI and Cohere only, no AWS API (its role has no policies)

# API: presigned uploads into quarantine and downloads from either bucket, reading an upload to
# check it, deleting a document's files, templates in the clean bucket
resource "aws_iam_role_policy" "api_s3" {
  name = "s3-access"
  role = aws_iam_role.api_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [local.quarantine_objects, local.clean_objects]
      },
      {
        # HeadObject on a missing key answers 404 (not 403) only with ListBucket
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.quarantine_bucket_arn, var.clean_bucket_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_ses" {
  count      = var.ses_send_policy_arn != null ? 1 : 0
  role       = aws_iam_role.api_task.name
  policy_arn = var.ses_send_policy_arn
}

# Ingestion: Textract on the quarantined upload (or on a PDF of its scanned pages, written under
# ocr-pages/ and deleted after), read its malware-scan tag, promote it (CopyObject carries the tags)
# and delete the quarantined copy
resource "aws_iam_role_policy" "worker_ingestion" {
  name = "ingestion-access"
  role = aws_iam_role.worker_ingestion_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["textract:StartDocumentAnalysis", "textract:GetDocumentAnalysis"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectTagging", "s3:DeleteObject"]
        Resource = [local.quarantine_objects]
      },
      {
        # Only the OCR copies: ingestion can't overwrite an upload
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = ["${var.quarantine_bucket_arn}/ocr-pages/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:PutObjectTagging"]
        Resource = [local.clean_objects]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.quarantine_bucket_arn, var.clean_bucket_arn]
      }
    ]
  })
}

# Generation: templates in, generated documents and previews out, all in the clean bucket
resource "aws_iam_role_policy" "worker_generation_s3" {
  name = "s3-access"
  role = aws_iam_role.worker_generation_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [local.clean_objects]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.clean_bucket_arn]
      }
    ]
  })
}

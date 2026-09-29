# Derive account ID — used to build ECR ARNs
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
}

# ---- IAM Group ----
resource "aws_iam_group" "developers" {
  name = "${var.project_name}-developers"
}

# ---- Developer Policy ----
resource "aws_iam_policy" "developer_access" {
  name        = "${var.project_name}-${var.environment}-developer-access"
  description = "Scoped access for Complytude developers: logs, ECR push, S3 read, ECS read, Textract"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs — view application logs
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
        ]
        Resource = "*"
      },

      # ECS — read-only visibility into running services/tasks
      {
        Sid    = "ECSReadOnly"
        Effect = "Allow"
        Action = [
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTasks",
          "ecs:DescribeTaskDefinition",
          "ecs:ListClusters",
          "ecs:ListServices",
          "ecs:ListTasks",
        ]
        Resource = "*"
      },

      # ECR — push/pull images (needed for CI and local Docker builds)
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:ListImages",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = "arn:aws:ecr:${local.region}:${local.account_id}:repository/${var.project_name}/*"
      },

      # S3 — read-only on staging buckets (list + get objects)
      {
        Sid    = "S3ReadStaging"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:GetObjectVersion",
        ]
        Resource = concat(
          var.s3_bucket_arns,
          [for arn in var.s3_bucket_arns : "${arn}/*"]
        )
      },

      # Secrets Manager — read staging app secret (for local dev troubleshooting)
      # Textract — full access for local development
      {
        Sid    = "TextractFull"
        Effect = "Allow"
        Action = [
          "textract:DetectDocumentText",
          "textract:AnalyzeDocument",
          "textract:StartDocumentTextDetection",
          "textract:StartDocumentAnalysis",
          "textract:GetDocumentTextDetection",
          "textract:GetDocumentAnalysis",
        ]
        Resource = "*"
      },

      # RDS / ElastiCache — describe only (view in console)
      {
        Sid    = "RDSDescribe"
        Effect = "Allow"
        Action = ["rds:Describe*", "rds:ListTagsForResource"]
        Resource = "*"
      },
      {
        Sid    = "ElastiCacheDescribe"
        Effect = "Allow"
        Action = ["elasticache:Describe*", "elasticache:List*"]
        Resource = "*"
      },

      # ---- DENY dangerous operations ----

      # Never allow IAM changes — prevents privilege escalation
      {
        Sid      = "DenyIAMWrite"
        Effect   = "Deny"
        Action   = ["iam:Create*", "iam:Delete*", "iam:Update*", "iam:Put*", "iam:Attach*", "iam:Detach*", "iam:PassRole"]
        Resource = "*"
      },

      # Never touch the Terraform state bucket — prevents infra corruption
      {
        Sid      = "DenyTerraformState"
        Effect   = "Deny"
        Action   = "s3:*"
        Resource = [
          "arn:aws:s3:::complytude-terraform-state",
          "arn:aws:s3:::complytude-terraform-state/*",
        ]
      },

      # Never write to production secrets
      {
        Sid      = "DenySecretsWrite"
        Effect   = "Deny"
        Action   = ["secretsmanager:PutSecretValue", "secretsmanager:DeleteSecret", "secretsmanager:RotateSecret"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_group_policy_attachment" "developer_access" {
  group      = aws_iam_group.developers.name
  policy_arn = aws_iam_policy.developer_access.arn
}

# ---- Developer IAM Users ----
resource "aws_iam_user" "developer" {
  for_each = toset(var.developer_usernames)

  name = each.key

  tags = {
    ManagedBy   = "terraform"
    Project     = var.project_name
    Environment = var.environment
    Role        = "developer"
  }
}

resource "aws_iam_user_group_membership" "developer" {
  for_each = toset(var.developer_usernames)

  user   = aws_iam_user.developer[each.key].name
  groups = [aws_iam_group.developers.name]
}

resource "aws_iam_access_key" "developer" {
  for_each = toset(var.developer_usernames)

  user = aws_iam_user.developer[each.key].name
}

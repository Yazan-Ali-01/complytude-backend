# ---- Developer access through IAM Identity Center (SSO) ----
# People sign in with `aws sso login` and get short-lived credentials for this permission set; no
# IAM user or access key exists. Enable IAM Identity Center in the account, create a group for the
# developers, and set identity_center_group_id; until then nothing is created.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  enabled    = var.identity_center_group_id != null
}

data "aws_ssoadmin_instances" "this" {
  count = local.enabled ? 1 : 0
}

locals {
  instance_arn = local.enabled ? tolist(data.aws_ssoadmin_instances.this[0].arns)[0] : null
}

resource "aws_ssoadmin_permission_set" "developer" {
  count            = local.enabled ? 1 : 0
  name             = "${var.project_name}-${var.environment}-developer"
  description      = "Logs, ECS/RDS/ElastiCache read, ECR pull, S3 read, Textract, bastion port forwarding"
  instance_arn     = local.instance_arn
  session_duration = "PT8H"
}

resource "aws_ssoadmin_permission_set_inline_policy" "developer" {
  count              = local.enabled ? 1 : 0
  instance_arn       = local.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.developer[0].arn

  inline_policy = jsonencode({
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

      # ECR — pull and inspect only: images reach ECR through CI, never from a laptop
      {
        Sid      = "ECRAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings",
          "ecr:DescribeRepositories",
          "ecr:GetDownloadUrlForLayer",
          "ecr:ListImages",
        ]
        Resource = "arn:aws:ecr:${local.region}:${local.account_id}:repository/${var.project_name}/*"
      },

      # SSM Session Manager — port forwarding through the bastion (DB tunnel, Bull Board)
      {
        Sid    = "BastionPortForwarding"
        Effect = "Allow"
        Action = ["ssm:StartSession"]
        Resource = [
          var.bastion_instance_arn,
          "arn:aws:ssm:${local.region}::document/AWS-StartPortForwardingSessionToRemoteHost",
        ]
      },
      {
        Sid      = "EndOwnSessions"
        Effect   = "Allow"
        Action   = ["ssm:TerminateSession", "ssm:ResumeSession"]
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:session/$${aws:userid}-*"
      },
      {
        Sid      = "FindBastion"
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances"]
        Resource = "*"
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
        Sid      = "RDSDescribe"
        Effect   = "Allow"
        Action   = ["rds:Describe*", "rds:ListTagsForResource"]
        Resource = "*"
      },
      {
        Sid      = "ElastiCacheDescribe"
        Effect   = "Allow"
        Action   = ["elasticache:Describe*", "elasticache:List*"]
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
        Sid    = "DenyTerraformState"
        Effect = "Deny"
        Action = "s3:*"
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

resource "aws_ssoadmin_account_assignment" "developers" {
  count              = local.enabled ? 1 : 0
  instance_arn       = local.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.developer[0].arn
  principal_type     = "GROUP"
  principal_id       = var.identity_center_group_id
  target_type        = "AWS_ACCOUNT"
  target_id          = local.account_id
}

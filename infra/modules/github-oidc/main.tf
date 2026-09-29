# ---- GitHub Actions → AWS without long-lived keys ----
# Jobs running in the GitHub environment `var.github_environment` of `var.github_repository` get
# short-lived credentials for this role (OIDC); no access key exists to leak or rotate.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
  account_id        = data.aws_caller_identity.current.account_id
  region            = data.aws_region.current.name
}

resource "aws_iam_role" "deploy" {
  name                 = "${var.project_name}-${var.environment}-github-deploy"
  description          = "Assumed by GitHub Actions jobs in the ${var.github_environment} environment of ${var.github_repository}"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRoleWithWebIdentity"
        Principal = { Federated = local.oidc_provider_arn }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            # Only jobs that declare this environment: other branches, forks and workflows can't
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.github_environment}"
          }
        }
      }
    ]
  })

  tags = { Name = "${var.project_name}-${var.environment}-github-deploy" }
}

# What scripts/deploy/*.sh and .github/workflows/deploy-staging.yml call, and nothing else
resource "aws_iam_role_policy" "deploy" {
  name = "deploy"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "EcrPushAndInspect"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImageScanFindings",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = var.ecr_repository_arns
      },
      {
        # Task definitions have no resource-level permissions for these two
        Sid      = "EcsTaskDefinitions"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
        Resource = "*"
      },
      {
        Sid      = "EcsServices"
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = var.ecs_service_arns
      },
      {
        Sid      = "PassTaskRoles"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = var.passable_role_arns
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
      {
        Sid      = "MigrationDatabase"
        Effect   = "Allow"
        Action   = ["rds:DescribeDBInstances"]
        Resource = var.rds_instance_arn
      },
      {
        Sid      = "MigrationSecrets"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.migration_secret_arns
      },
      {
        Sid      = "FindBastion"
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances"]
        Resource = "*"
      },
      {
        Sid    = "PortForwardThroughBastion"
        Effect = "Allow"
        Action = ["ssm:StartSession"]
        Resource = [
          var.bastion_instance_arn,
          "arn:aws:ssm:${local.region}::document/AWS-StartPortForwardingSessionToRemoteHost",
        ]
      },
      {
        Sid    = "EndOwnSessions"
        Effect = "Allow"
        Action = ["ssm:TerminateSession"]
        # SSM names a session after the role session name the workflow sets (role-session-name)
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:session/github-deploy-*"
      },
    ]
  })
}

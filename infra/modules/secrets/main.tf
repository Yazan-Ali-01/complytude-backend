# ---- Application Secrets (AWS Secrets Manager) ----
# Single JSON secret containing all runtime config for API and workers.
# ECS task definitions reference keys via valueFrom:
#   arn:aws:secretsmanager:region:account:secret:name:key::
resource "aws_secretsmanager_secret" "app" {
  name        = "${var.project_name}/${var.environment}/app"
  description = "Application secrets for ${var.project_name} ${var.environment} (DB, JWT, Redis, S3)"

  tags = {
    Name = "${var.project_name}-${var.environment}-app-secrets"
  }
}

# ---- IAM Policy for ECS Task Execution Role ----
# Attach this policy to the ECS task execution role so it can fetch secrets at container startup.
# When implementing ECS: aws_iam_role_policy_attachment.ecs_secrets with policy_arn = module.secrets.policy_arn
resource "aws_iam_policy" "ecs_read_secrets" {
  name        = "${var.project_name}-${var.environment}-ecs-read-secrets"
  description = "Allows ECS task execution role to read application secrets from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.app.arn]
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-secrets-policy"
  }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    # Database
    DB_HOST           = var.db_host
    DB_PORT           = tostring(var.db_port)
    DB_NAME           = var.db_name
    DB_APP_USER       = var.db_app_user
    DB_APP_PASSWORD   = var.db_app_password
    DB_SSL_ENABLED    = var.db_ssl_enabled
        DB_SSL_REJECT_UNAUTHORIZED = var.db_ssl_reject_unauthorized

    DB_MAX_CONNECTIONS = "20"
    DB_IDLE_TIMEOUT   = "30000"
    DB_CONNECTION_TIMEOUT = "2000"

    # Redis
    REDIS_HOST    = var.redis_host
    REDIS_PORT    = tostring(var.redis_port)
    REDIS_PASSWORD = var.redis_password
    REDIS_TLS     = tostring(var.redis_tls)
    REDIS_DB      = "0"
    REDIS_QUEUE_DB = "1"
    REDIS_KEY_PREFIX = "complytude:"

    # JWT
    JWT_ACCESS_SECRET         = var.jwt_access_secret
    JWT_REFRESH_SECRET       = var.jwt_refresh_secret
    JWT_IDENTITY_SECRET      = var.jwt_identity_secret
    JWT_IDENTITY_REFRESH_SECRET = var.jwt_identity_refresh_secret
    JWT_REFRESH_HASH_SECRET   = var.jwt_refresh_hash_secret
    JWT_ACCESS_EXPIRES_IN    = "30m"
    JWT_REFRESH_EXPIRES_IN   = "14d"
    JWT_IDENTITY_EXPIRES_IN  = "10m"
    JWT_IDENTITY_REFRESH_EXPIRES_IN = "14d"

    # S3
    S3_REGION   = var.s3_region
    S3_ENDPOINT = var.s3_endpoint
    S3_ACCESS_KEY = var.s3_access_key
    S3_SECRET_KEY = var.s3_secret_key
    S3_FORCE_PATH_STYLE = "false"
    COMPLYTUDE_FILES_BUCKET_NAME = var.s3_quarantine_bucket
    TEMPLATES_BUCKET_NAME        = var.s3_clean_bucket
    MAX_FILE_SIZE               = "10485760"
    TEMPLATE_MAX_FILE_SIZE      = "5242880"
    SIGNED_URL_EXPIRES_IN       = "900"

    # App
    CORS_ORIGINS = var.cors_origins

    # OpenAI (for worker-ai, worker-ingestion)
    OPENAI_API_KEY = var.openai_api_key

    # Stripe
    STRIPE_SECRET_KEY          = var.stripe_secret_key
    STRIPE_PUBLISHABLE_KEY     = var.stripe_publishable_key
    STRIPE_WEBHOOK_SECRET      = var.stripe_webhook_secret
    STRIPE_CATALOG_SYNC_ENABLED = var.stripe_catalog_sync_enabled
    STRIPE_TAX_ENABLED          = var.stripe_tax_enabled
  })
}

# Deployment Guide

This guide covers the full AWS deployment for Complytude — staging and production environments, CI/CD pipeline, infrastructure management, and operational runbooks.

## Table of Contents

- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [CI/CD Pipeline (Automatic)](#cicd-pipeline-automatic)
- [Manual Deployment](#manual-deployment)
- [Accessing Logs](#accessing-logs)
- [Running Migrations in Production](#running-migrations-in-production)
- [Connecting to RDS for Debugging](#connecting-to-rds-for-debugging)
- [Rolling Back a Deployment](#rolling-back-a-deployment)
- [Cost Overview](#cost-overview)
- [Terraform Cheat Sheet](#terraform-cheat-sheet)
- [Troubleshooting](#troubleshooting)
- [Local Docker Development](#local-docker-development)

---

## Architecture

### AWS Resource Map (Staging)

```
Internet
    │
    ▼
Route 53 (complytude.com)
  api-staging.complytude.com  →  ALB (complytude-staging-alb)
    │
    ▼
Application Load Balancer
  HTTPS :443  →  ECS API :3000
    │
    ▼
┌─────────────────────────────── VPC: complytude-staging (10.0.0.0/16) ───────────────────────────────┐
│                                                                                                      │
│  ┌─────────────────────────────── ECS Cluster: complytude-staging ────────────────────────────────┐  │
│  │                                                                                                │  │
│  │  ┌──────────────────────────┐   ┌─────────────────────┐   ┌──────────────────────────────┐   │  │
│  │  │  Service: …-api          │   │  Service: …-worker-ai│   │  Service: …-worker-ingestion  │   │  │
│  │  │  Fargate 1 vCPU / 2 GB  │   │  Fargate 0.5 / 1 GB │   │  Fargate 0.5 vCPU / 1 GB    │   │  │
│  │  │  ┌──────────┐ ┌───────┐ │   │  ┌────────────────┐  │   │  ┌────────────────────────┐  │   │  │
│  │  │  │ api      │ │ gotenb│ │   │  │   worker-ai    │  │   │  │    worker-ingestion    │  │   │  │
│  │  │  │ :3000    │ │ :3100 │ │   │  │                │  │   │  │                        │  │   │  │
│  │  │  └──────────┘ └───────┘ │   │  └────────────────┘  │   │  └────────────────────────┘  │   │  │
│  │  └──────────────────────────┘   └─────────────────────┘   └──────────────────────────────┘   │  │
│  │                                                                                                │  │
│  │  ┌────────────────────────────────────────┐                                                   │  │
│  │  │  Service: …-worker-generation           │                                                   │  │
│  │  │  Fargate 1 vCPU / 2 GB                 │                                                   │  │
│  │  │  ┌──────────────────┐ ┌──────────────┐ │                                                   │  │
│  │  │  │ worker-generation│ │ gotenberg     │ │                                                   │  │
│  │  │  │                  │ │ :3100 sidecar │ │                                                   │  │
│  │  │  └──────────────────┘ └──────────────┘ │                                                   │  │
│  │  └────────────────────────────────────────┘                                                   │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                      │
│  ┌───────────────────────────────┐   ┌──────────────────────────────────────────────────────────┐   │
│  │  RDS: complytude-staging-     │   │  ElastiCache: complytude-staging-redis                   │   │
│  │  postgres                     │   │  Redis 7.0, cache.t4g.micro                              │   │
│  │  PostgreSQL 16.12, db.t4g.    │   │  Port 6379, TLS + AUTH, noeviction                      │   │
│  │  micro, 20 GB gp3             │   └──────────────────────────────────────────────────────────┘   │
│  └───────────────────────────────┘                                                                   │
│                                                                                                      │
│  ┌───────────────────────────────┐                                                                   │
│  │  Bastion: complytude-staging- │                                                                   │
│  │  bastion  (t4g.micro)         │                                                                   │
│  │  SSH tunnel → RDS only        │                                                                   │
│  └───────────────────────────────┘                                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

AWS Services (global / regional, not in VPC):
  ECR:               {account}.dkr.ecr.eu-central-1.amazonaws.com/complytude/{api|worker-*}
  S3 Quarantine:     complytude-staging-quarantine   (raw uploads → Textract)
  S3 Clean:          complytude-staging-clean        (validated files + templates)
  Secrets Manager:   complytude/staging/app          (all runtime secrets)
  SES:               billing@complytude.com, support@complytude.com
  CloudWatch Logs:   /ecs/complytude-staging/*
  SNS Alarms:        complytude-staging-alarms  →  yazan.ali.dev@gmail.com
  ACM:               *.complytude.com (auto-renews)
  Terraform State:   s3://complytude-terraform-state/staging/terraform.tfstate  (me-central-1)
```

### Resource Name Reference

| Resource | Name / Identifier |
|---|---|
| ECS Cluster | `complytude-staging` |
| ECS Service — API | `complytude-staging-api` |
| ECS Service — Worker AI | `complytude-staging-worker-ai` |
| ECS Service — Worker Ingestion | `complytude-staging-worker-ingestion` |
| ECS Service — Worker Generation | `complytude-staging-worker-generation` |
| RDS Instance | `complytude-staging-postgres` |
| ElastiCache Cluster | `complytude-staging-redis` |
| S3 — quarantine | `complytude-staging-quarantine` |
| S3 — clean/files | `complytude-staging-clean` |
| Secrets Manager secret | `complytude/staging/app` |
| ECR — API | `complytude/api` |
| ECR — Worker AI | `complytude/worker-ai` |
| ECR — Worker Ingestion | `complytude/worker-ingestion` |
| ECR — Worker Generation | `complytude/worker-generation` |
| Bastion host | `complytude-staging-bastion` |
| Bastion SG | `complytude-staging-bastion-sg` |
| RDS SG | `complytude-staging-rds-sg` |
| ALB | `complytude-staging-alb` |
| SNS topic | `complytude-staging-alarms` |
| Terraform state bucket | `complytude-terraform-state` (region: `me-central-1`) |
| Terraform lock table | `complytude-terraform-locks` |

---

## Environment Variables

All environment variables for the ECS tasks come from one of two places: **AWS Secrets Manager** (sensitive runtime config) or **plain environment variables** baked directly into the ECS task definition by Terraform.

### Secrets Manager — `complytude/staging/app`

A single JSON secret. ECS pulls individual keys at startup via `valueFrom: "arn:…:secret:complytude/staging/app:KEY::"`. Update secrets in the AWS Console or via `aws secretsmanager put-secret-value`; then force a new ECS deployment to pick them up.

| Key | Description |
|---|---|
| `DB_HOST` | RDS hostname |
| `DB_PORT` | `5432` |
| `DB_NAME` | `complytude` |
| `DB_APP_USER` | Application DB login role (not postgres superuser) |
| `DB_APP_PASSWORD` | Application DB password |
| `DB_SSL_ENABLED` | `true` in production |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` in production |
| `DB_MAX_CONNECTIONS` | `20` |
| `DB_IDLE_TIMEOUT` | `30000` |
| `DB_CONNECTION_TIMEOUT` | `2000` |
| `REDIS_HOST` | ElastiCache hostname |
| `REDIS_PORT` | `6379` |
| `REDIS_PASSWORD` | The ElastiCache AUTH token, generated by the `elasticache` module and written to the secret |
| `REDIS_TLS` | `true` (TLS in transit is on in every environment) |
| `REDIS_DB` | `0` (session/cache) |
| `REDIS_QUEUE_DB` | `1` (BullMQ queues) |
| `REDIS_KEY_PREFIX` | `complytude:` |
| `JWT_ACCESS_SECRET` | Tenant access token signing key |
| `JWT_REFRESH_SECRET` | Tenant refresh token signing key |
| `JWT_IDENTITY_SECRET` | Identity access token signing key |
| `JWT_IDENTITY_REFRESH_SECRET` | Identity refresh token signing key |
| `JWT_ACCESS_EXPIRES_IN` | `30m` |
| `JWT_IDENTITY_EXPIRES_IN` | `10m` |
| `SESSION_MAX_TTL` | `14d` |
| `SESSION_IDLE_TIMEOUT` | `72h` |
| `SESSION_MAX_PER_USER` | `5` |
| `SESSION_ACTIVITY_THROTTLE_SECONDS` | `120` |
| `S3_REGION` | `eu-central-1` |
| `S3_ENDPOINT` | Empty (AWS S3) |
| `S3_ACCESS_KEY` | IAM key for S3 (or empty if using ECS task role) |
| `S3_SECRET_KEY` | IAM secret for S3 |
| `S3_FORCE_PATH_STYLE` | `false` |
| `COMPLYTUDE_FILES_BUCKET_NAME` | `complytude-staging-clean` |
| `TEMPLATES_BUCKET_NAME` | `complytude-staging-clean` |
| `QUARANTINE_BUCKET_NAME` | `complytude-staging-quarantine` |
| `MAX_FILE_SIZE` | `10485760` (10 MB) |
| `TEMPLATE_MAX_FILE_SIZE` | `5242880` (5 MB) |
| `SIGNED_URL_EXPIRES_IN` | `900` (15 min) |
| `CORS_ORIGINS` | `https://api-staging.complytude.com` |
| `OPENAI_API_KEY` | OpenAI API key |
| `COHERE_API_KEY` | Cohere reranking API key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_CATALOG_SYNC_ENABLED` | `true` |
| `STRIPE_TAX_ENABLED` | `true` |
| `BILLING_SCHEDULE_ENABLED` | `true`/`false` |
| `AWS_REGION` | `eu-central-1` (for SES) |
| `FROM_EMAIL` | `billing@complytude.com` |
| `FROM_NAME` | `Complytude Billing` |
| `SUPPORT_EMAIL` | `support@complytude.com` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `https://api-staging.complytude.com/api/v1/auth/google/callback` |
| `MICROSOFT_CLIENT_ID` | Azure app client ID (empty = disabled) |
| `MICROSOFT_CLIENT_SECRET` | Azure app secret |
| `MICROSOFT_CALLBACK_URL` | Microsoft OAuth callback |
| `MICROSOFT_TENANT_ID` | Azure tenant ID |
| `SSO_FRONTEND_SUCCESS_PATH` | Frontend path after SSO success |
| `SSO_FRONTEND_ERROR_PATH` | Frontend path after SSO error |

### Plain Environment Variables (ECS Task Definition)

These are not secret and are set directly in the task definition by Terraform (via `terraform.tfvars`). To change them, update `terraform.tfvars` and run `terraform apply`.

**API task:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `SERVICE_NAME` | `gateway` |
| `GOTENBERG_URL` | `http://localhost:3100` |

Leave `ENABLE_MOCK_ROUTES` unset. It defaults to `false`, and the API refuses to boot if it is `true` with `NODE_ENV=production`.

**Worker AI task:**

| Variable | Source |
|---|---|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `SERVICE_NAME` | `worker-ai` |
| `WORKER_AI_CONCURRENCY` | `worker_ai_concurrency` tfvar (default: 5) |
| `WORKER_AI_MAX_RETRIES` | `worker_ai_max_retries` tfvar (default: 3) |
| `WORKER_AI_RETRY_DELAY` | `worker_ai_retry_delay` tfvar (default: 5000 ms) |
| `WORKER_AI_MAX_PROCESSING_TIME` | `worker_ai_max_processing_time` tfvar (default: 300000 ms) |
| `OPENAI_CHAT_MODEL` | `openai_chat_model` tfvar (default: `gpt-4o-mini`) |
| `OPENAI_CHAT_MAX_TOKENS` | `openai_chat_max_tokens` tfvar (default: 4096) |
| `OPENAI_CHAT_TEMPERATURE` | `openai_chat_temperature` tfvar (default: 0.1) |
| `OPENAI_CHAT_TIMEOUT` | `openai_chat_timeout` tfvar (default: 120000 ms) |
| `OPENAI_EMBEDDING_MODEL` | `openai_embedding_model` tfvar (default: `text-embedding-3-small`) |
| `OPENAI_EMBEDDING_DIMENSIONS` | `openai_embedding_dimensions` tfvar (default: 1536) |
| `OPENAI_MAX_RETRIES` | `openai_max_retries` tfvar (default: 3) |
| `EMBEDDING_CHUNK_SIZE` | `embedding_chunk_size` tfvar (default: 512) |
| `EMBEDDING_CHUNK_OVERLAP` | `embedding_chunk_overlap` tfvar (default: 50) |
| `COHERE_RERANK_MODEL` | `cohere_rerank_model` tfvar (default: `rerank-v3.5`) |
| `RERANK_TOP_N` | `rerank_top_n` tfvar (default: 25) |
| `RAG_TOP_K_PER_QUERY` | `rag_top_k_per_query` tfvar (default: 5) |
| `RAG_VECTOR_LIMIT` | `rag_vector_limit` tfvar (default: 30) |
| `RAG_BM25_LIMIT` | `rag_bm25_limit` tfvar (default: 30) |
| `RAG_MAX_HYBRID_RESULTS` | `rag_max_hybrid_results` tfvar (default: 40) |

**Worker Ingestion task:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `SERVICE_NAME` | `worker-ingestion` |

**Worker Generation task:**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `SERVICE_NAME` | `worker-generation` |
| `GOTENBERG_URL` | `http://localhost:3100` |

### Updating a Secret

```bash
# Fetch current secret, edit a key, push back
aws secretsmanager get-secret-value \
  --secret-id complytude/staging/app \
  --query SecretString \
  --output text | jq '. + {"SOME_KEY": "new-value"}' > /tmp/new-secret.json

aws secretsmanager put-secret-value \
  --secret-id complytude/staging/app \
  --secret-string file:///tmp/new-secret.json

rm /tmp/new-secret.json

# Force ECS to restart and pick up the new secret
aws ecs update-service \
  --cluster complytude-staging \
  --service complytude-staging-api \
  --force-new-deployment \
  --region eu-central-1
```

---

## CI/CD Pipeline (Automatic)

### Trigger

Every push to the `development` branch triggers the staging deploy pipeline defined in `.github/workflows/deploy-staging.yml`.

### Pipeline Jobs

```
push → development
         │
         ▼
    ┌─────────┐
    │ quality │  lint + type-check
    └────┬────┘
         │
    ┌────┴────────────────────┐
    │                         │
    ▼                         ▼
┌───────────────────┐   ┌─────────────────────┐
│ migrate-and-seed  │   │   build-and-push     │
│                   │   │  (matrix: api,       │
│ SSH tunnel →      │   │   worker-ai,         │
│ bastion → RDS     │   │   worker-ingestion,  │
│ setup-roles.sh    │   │   worker-generation) │
│ run-migrations.sh │   │                      │
│ run-seeds.sh      │   │  Pushes to ECR:      │
└─────────┬─────────┘   │  :latest + :sha      │
          │             └──────────┬────────────┘
          └──────────┬─────────────┘
                     │
                     ▼
                ┌─────────┐
                │ deploy  │
                │         │
                │ force-new-deployment on all 4 services
                │ wait for services-stable
                └─────────┘
```

### Required GitHub Actions Secrets

Set these in **Settings → Secrets and variables → Actions** in the GitHub repo:

| Secret | Description |
|---|---|
| `AWS_ACCOUNT_ID` | AWS account number (12 digits) |
| `AWS_ACCESS_KEY_ID` | IAM access key with deploy permissions |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| `BASTION_SSH_KEY` | Private key for `bastion-key-pair` (PEM format) |
| `STAGING_DB_ADMIN_PASSWORD` | RDS `postgres` superuser password (matches `db_password` in tfvars) |

### Concurrency

Only one staging deploy runs at a time. A newer push cancels an in-progress deploy (`cancel-in-progress: true`).

---

## Manual Deployment

Use this when CI/CD is broken, you need to deploy a hotfix from a non-`development` branch, or you need to roll back.

### Prerequisites

```bash
# Install AWS CLI and configure profile
aws configure  # or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars
export AWS_REGION=eu-central-1

# Login to ECR
aws ecr get-login-password --region eu-central-1 | \
  docker login --username AWS \
    --password-stdin \
    $(aws sts get-caller-identity --query Account --output text).dkr.ecr.eu-central-1.amazonaws.com
```

### Build and Push Images

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="${ACCOUNT}.dkr.ecr.eu-central-1.amazonaws.com"
TAG=$(git rev-parse --short HEAD)

# Build and push all apps (run in parallel if needed)
for APP in api worker-ai worker-ingestion worker-generation; do
  docker build \
    -f apps/${APP}/Dockerfile \
    --target production \
    -t "${REGISTRY}/complytude/${APP}:${TAG}" \
    -t "${REGISTRY}/complytude/${APP}:latest" \
    .

  docker push "${REGISTRY}/complytude/${APP}:${TAG}"
  docker push "${REGISTRY}/complytude/${APP}:latest"
done
```

### Force New ECS Deployment

```bash
CLUSTER=complytude-staging

for SERVICE in api worker-ai worker-ingestion worker-generation; do
  aws ecs update-service \
    --cluster ${CLUSTER} \
    --service complytude-staging-${SERVICE} \
    --force-new-deployment \
    --region eu-central-1
done

# Wait for all services to stabilize (~3-5 minutes)
for SERVICE in api worker-ai worker-ingestion worker-generation; do
  echo "Waiting for complytude-staging-${SERVICE}..."
  aws ecs wait services-stable \
    --cluster ${CLUSTER} \
    --services complytude-staging-${SERVICE}
done
echo "All services stable."
```

---

## Accessing Logs

All containers log to CloudWatch Logs via the `awslogs` driver. Log streams are prefixed by container name.

### CloudWatch Log Groups

| Service | Log Group |
|---|---|
| API | `/ecs/complytude-staging/api` |
| Gotenberg (API sidecar) | `/ecs/complytude-staging/gotenberg` |
| Worker AI | `/ecs/complytude-staging/worker-ai` |
| Worker Ingestion | `/ecs/complytude-staging/worker-ingestion` |
| Worker Generation | `/ecs/complytude-staging/worker-generation` |
| Gotenberg (generation sidecar) | `/ecs/complytude-staging/worker-generation-gotenberg` |

### Tailing Logs via AWS CLI

```bash
# Tail API logs (last 5 minutes, follow)
aws logs tail /ecs/complytude-staging/api \
  --follow \
  --since 5m \
  --region eu-central-1

# Filter for errors only
aws logs tail /ecs/complytude-staging/api \
  --follow \
  --filter-pattern '"level":"error"' \
  --region eu-central-1

# Filter by tenantId
aws logs tail /ecs/complytude-staging/worker-ai \
  --follow \
  --filter-pattern '"tenantId":"<uuid>"' \
  --region eu-central-1
```

### AWS Console

**CloudWatch → Log groups → `/ecs/complytude-staging/api` → Log streams**

Each ECS task gets its own log stream named `api/{container-name}/{task-id}`.

---

## Running Migrations in Production

RDS is not publicly accessible. Migrations run through an SSH tunnel via the bastion host, exactly as the CI/CD pipeline does.

### One-time SSH key setup

The bastion uses the `bastion-key-pair` EC2 key pair. Retrieve the private key from whoever provisioned the infrastructure (it was generated at Terraform apply time and is stored in GitHub Actions as `BASTION_SSH_KEY`).

```bash
chmod 600 ~/.ssh/bastion-key.pem
```

### Open SSH Tunnel to RDS

```bash
# Get bastion public IP
BASTION_IP=$(aws ec2 describe-instances \
  --filters \
    "Name=tag:Name,Values=complytude-staging-bastion" \
    "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text \
  --region eu-central-1)

# Get RDS hostname from Secrets Manager
DB_HOST=$(aws secretsmanager get-secret-value \
  --secret-id complytude/staging/app \
  --query SecretString \
  --output text \
  --region eu-central-1 | jq -r .DB_HOST)

echo "Bastion: ${BASTION_IP}"
echo "RDS:     ${DB_HOST}"

# Open tunnel — forwards local :15432 → RDS :5432 through the bastion
ssh -i ~/.ssh/bastion-key.pem \
  -fNL 15432:${DB_HOST}:5432 \
  ec2-user@${BASTION_IP} \
  -o StrictHostKeyChecking=no
```

> **Security groups:** Your IP must be in the bastion security group's SSH ingress. Add it temporarily if needed:
> ```bash
> MY_IP=$(curl -s https://checkip.amazonaws.com)
> BASTION_SG=$(aws ec2 describe-security-groups \
>   --filters "Name=tag:Name,Values=complytude-staging-bastion-sg" \
>   --query 'SecurityGroups[0].GroupId' --output text --region eu-central-1)
> aws ec2 authorize-security-group-ingress \
>   --group-id ${BASTION_SG} --protocol tcp --port 22 --cidr ${MY_IP}/32 --region eu-central-1
> # Remember to revoke it when done:
> # aws ec2 revoke-security-group-ingress ...
> ```

### Run Migrations

```bash
# With tunnel open on :15432
DB_HOST=localhost \
DB_PORT=15432 \
DB_NAME=complytude \
DB_USER=postgres \
DB_PASSWORD=<staging-db-admin-password> \
  bash scripts/run-migrations.sh
```

### Run Seeds (reference data only)

```bash
DB_HOST=localhost \
DB_PORT=15432 \
DB_NAME=complytude \
DB_USER=postgres \
DB_PASSWORD=<staging-db-admin-password> \
  bash scripts/run-seeds.sh staging
```

For `staging` and `production` this loads the reference data only (authorities, categories). The test tenants and users, which share a published password, load only in `development`/`test`; see `scripts/seeds/README.md`.

### Create a Platform Admin

No platform admin is seeded in deployed environments, and no password is kept in the repo. Grant the role with the CLI built into the API image. It creates the account (verified, without a password) and emails a set-password link valid for 24 hours. It can also promote an existing account, which must have a verified email. Each grant writes a `PLATFORM_ROLE_GRANTED` audit row and ends the user's existing sessions when the role changes.

Run it as a one-off ECS task, so it uses the API task's own secrets and network:

```bash
CLUSTER=$(terraform -chdir=infra/environments/staging output -raw ecs_cluster_name)
aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE \
  --task-definition "$CLUSTER-api" \
  --network-configuration "awsvpcConfiguration={subnets=[<public-subnet-id>],securityGroups=[<ecs-sg-id>],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/apps/api/main.js","grant-platform-admin","you@company.com"]}]}'
```

Locally (or through the bastion tunnel, with the target environment's variables set):

```bash
pnpm admin:grant you@company.com                    # system_admin (default)
pnpm admin:grant auditor@company.com --role auditor # support | auditor
```

The command exits non-zero, and changes nothing, if the account exists but its email isn't verified.

### Close the Tunnel

```bash
pkill -f "ssh.*15432"
```

---

## Connecting to RDS for Debugging

Same tunnel approach as migrations. Once the tunnel is open:

```bash
# psql via tunnel
PGPASSWORD=<password> psql \
  -h localhost \
  -p 15432 \
  -U postgres \
  -d complytude

# Or as the app user (read/write, RLS enforced)
PGPASSWORD=<app-password> psql \
  -h localhost \
  -p 15432 \
  -U app_login \
  -d complytude
```

**Read-only inspection without RLS** (use postgres superuser):

```sql
-- Check tenant data directly
SET app.tenant_id = '<tenant-uuid>';  -- activates RLS for a specific tenant
SELECT * FROM tenants LIMIT 10;

-- Bypass RLS (superuser only)
SET row_security = off;
SELECT * FROM users LIMIT 10;
```

**Performance Insights** is enabled on the RDS instance (7-day retention). Access it at:
AWS Console → RDS → `complytude-staging-postgres` → Performance Insights.

---

## Rolling Back a Deployment

ECS has a **deployment circuit breaker** enabled on all services: if a new deployment fails its health checks, ECS automatically rolls back to the previous task definition. This happens within ~5 minutes of a bad deploy.

### Automatic Rollback

ECS will roll back automatically if the new tasks fail health checks 3 times. Check the ECS console under the service's **Deployments** tab to confirm rollback status.

### Manual Rollback to Previous Task Definition

```bash
CLUSTER=complytude-staging
SERVICE=complytude-staging-api  # repeat for other services as needed

# List recent task definition revisions
aws ecs list-task-definitions \
  --family-prefix complytude-staging-api \
  --sort DESC \
  --region eu-central-1 \
  --query 'taskDefinitionArns[:5]'

# Deploy a specific previous revision (e.g., revision 12)
aws ecs update-service \
  --cluster ${CLUSTER} \
  --service ${SERVICE} \
  --task-definition complytude-staging-api:12 \
  --region eu-central-1

aws ecs wait services-stable \
  --cluster ${CLUSTER} \
  --services ${SERVICE} \
  --region eu-central-1
```

### Rollback a Bad Migration

Migrations are plain SQL files in `scripts/migrations/`. Since the project is pre-production, the safest approach is to edit the migration file in place and re-run:

```bash
# 1. Connect via SSH tunnel (see above)
# 2. Drop the offending objects manually
# 3. Edit scripts/migrations/XXX_migration.sql
# 4. Re-run migrations
DB_HOST=localhost DB_PORT=15432 DB_NAME=complytude \
  DB_USER=postgres DB_PASSWORD=<password> \
  bash scripts/run-migrations.sh
```

For a full reset (staging only — destroys all data):

```bash
# Via tunnel
PGPASSWORD=<password> psql -h localhost -p 15432 -U postgres -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

DB_HOST=localhost DB_PORT=15432 DB_NAME=complytude \
  DB_USER=postgres DB_PASSWORD=<password> \
  bash scripts/run-migrations.sh

DB_HOST=localhost DB_PORT=15432 DB_NAME=complytude \
  DB_USER=postgres DB_PASSWORD=<password> \
  bash scripts/run-seeds.sh staging   # reference data only

# Then create a platform admin: see "Create a Platform Admin" above
```

---

## Cost Overview

All figures are approximate monthly costs for the **staging** environment running 24/7 in `eu-central-1`.

| Resource | Spec | Approx. Cost/Month |
|---|---|---|
| RDS `complytude-staging-postgres` | db.t4g.micro, 20 GB gp3, single-AZ | ~$15 |
| ElastiCache `complytude-staging-redis` | cache.t4g.micro, 1 node, `noeviction`, 1-day snapshots (production: 2 nodes, Multi-AZ failover, 7 days) | ~$12 |
| Bastion EC2 | t4g.micro, Amazon Linux 2023 ARM | ~$7 |
| ECS Fargate — API | 1 vCPU / 2 GB, 1 task | ~$36 |
| ECS Fargate — Worker AI | 0.5 vCPU / 1 GB, 1 task | ~$18 |
| ECS Fargate — Worker Ingestion | 0.5 vCPU / 1 GB, 1 task | ~$18 |
| ECS Fargate — Worker Generation | 1 vCPU / 2 GB, 1 task | ~$36 |
| ALB | 1 ALB, minimal traffic | ~$18 |
| S3 | Two buckets, low volume | <$1 |
| ECR | 10 images × 4 repos | <$1 |
| CloudWatch Logs | Depends on log volume | ~$1–5 |
| Route 53 | 1 hosted zone | ~$1 |
| Secrets Manager | 1 secret | <$1 |
| ACM | Free | $0 |
| SES | Pay-per-email, low volume | <$1 |
| **Total (staging)** | | **~$163–170/month** |

**Production cost scaling:** Production adds Multi-AZ RDS (2× RDS cost), larger instance classes, and multiple task replicas. Estimate 3–4× the staging cost for a minimal production setup.

**Shutting down staging when idle** (saves ~$70/month on Fargate):

```bash
cd infra/environments/staging
# Scale all ECS services to 0
for SERVICE in api worker-ai worker-ingestion worker-generation; do
  aws ecs update-service \
    --cluster complytude-staging \
    --service complytude-staging-${SERVICE} \
    --desired-count 0 \
    --region eu-central-1
done
# Restart when needed by setting desired-count back to 1
```

---

## Terraform Cheat Sheet

All Terraform commands must be run from the environment directory.

```bash
cd infra/environments/staging
```

### First-time Setup

```bash
# Copy and fill in your secrets (never commit this file)
cp terraform.tfvars terraform.tfvars.example
# Edit terraform.tfvars with your actual values

terraform init   # downloads providers, connects to S3 backend
terraform plan   # preview all changes — always review before applying
terraform apply  # provision / update infrastructure
```

### Daily Operations

```bash
# Preview changes before applying
terraform plan

# Apply changes (will prompt for confirmation)
terraform apply

# Apply a targeted resource only
terraform apply -target=module.ecs

# Destroy staging (be careful — deletes data)
terraform destroy
```

### View Outputs

```bash
# All outputs
terraform output

# Specific output
terraform output rds_hostname
terraform output bastion_public_ip
terraform output ecr_repository_urls

# Developer access keys (sensitive)
terraform output -json developer_access_keys
```

### State Management

```bash
# List all resources in state
terraform state list

# Inspect a specific resource
terraform state show module.rds.aws_db_instance.main

# Refresh state from AWS (reconcile drift)
terraform refresh

# Import an existing resource (if created outside Terraform)
terraform import module.rds.aws_db_instance.main complytude-staging-postgres
```

### Useful One-liners

```bash
# Update a single secret and redeploy (faster than full apply)
aws secretsmanager put-secret-value \
  --secret-id complytude/staging/app \
  --secret-string "$(aws secretsmanager get-secret-value \
    --secret-id complytude/staging/app \
    --query SecretString --output text | \
    jq '. + {"SOME_KEY":"new-value"}')" \
  --region eu-central-1

# Tune a worker-ai knob (e.g. increase concurrency)
# 1. Edit terraform.tfvars: worker_ai_concurrency = 10
# 2. Apply only the ECS module
terraform apply -target=module.ecs

# Rotate all JWT secrets
openssl rand -base64 64  # generate 4 new values
# Update complytude/staging/app in Secrets Manager
# Then force-redeploy all services
```

---

## Troubleshooting

### ECS service stuck in PENDING / task fails to start

```bash
# Check service events for error messages
aws ecs describe-services \
  --cluster complytude-staging \
  --services complytude-staging-api \
  --region eu-central-1 \
  --query 'services[0].events[:10]'

# Check stopped task exit codes and reason
aws ecs list-tasks \
  --cluster complytude-staging \
  --service-name complytude-staging-api \
  --desired-status STOPPED \
  --region eu-central-1

aws ecs describe-tasks \
  --cluster complytude-staging \
  --tasks <task-arn> \
  --region eu-central-1 \
  --query 'tasks[0].containers[*].{name:name,exitCode:exitCode,reason:reason}'
```

Common causes:
- **Secret not found**: verify `complytude/staging/app` exists and has all required keys
- **Image pull failure**: check ECR login and that the `:latest` tag exists
- **Health check failing**: check `/api/health` returns 200; look at CloudWatch logs for startup errors
- **Gotenberg not healthy**: the API and worker-generation tasks wait for Gotenberg to be `HEALTHY` before starting — check `/ecs/complytude-staging/gotenberg` logs

### New deployment stuck (not rolling out)

ECS circuit breaker will auto-rollback after ~5 minutes. To check:

```bash
aws ecs describe-services \
  --cluster complytude-staging \
  --services complytude-staging-api \
  --region eu-central-1 \
  --query 'services[0].deployments'
```

If `rolloutState` is `FAILED`, the circuit breaker fired. Check stopped task logs for the root cause.

### Database connection errors in logs

```bash
# Verify the DB is accepting connections (from bastion)
ssh -i ~/.ssh/bastion-key.pem ec2-user@<bastion-ip> \
  "pg_isready -h <rds-hostname> -p 5432"

# Check RDS status in console
aws rds describe-db-instances \
  --db-instance-identifier complytude-staging-postgres \
  --query 'DBInstances[0].DBInstanceStatus' \
  --region eu-central-1
```

If the ECS task's DB credentials are wrong, update `complytude/staging/app` in Secrets Manager and force a new deployment.

### Redis connection errors

```bash
# Check ElastiCache cluster status
aws elasticache describe-cache-clusters \
  --region eu-central-1 \
  --query 'CacheClusters[?contains(CacheClusterId, `staging`)]'

# Ping Redis from bastion
ssh -i ~/.ssh/bastion-key.pem ec2-user@<bastion-ip> \
  "redis-cli -h <redis-hostname> -p 6379 ping"
```

### BullMQ jobs not processing

```bash
# Check queue depths via Redis (from bastion)
ssh -i ~/.ssh/bastion-key.pem ec2-user@<bastion-ip> \
  "redis-cli -h <redis-host> -p 6379 -n 1 keys 'bull:*:wait' | \
   xargs -I{} redis-cli -h <redis-host> -p 6379 -n 1 llen {}"

# Check worker logs for job pickup
aws logs tail /ecs/complytude-staging/worker-ai \
  --follow --since 10m --region eu-central-1
```

If workers are healthy but not picking up jobs, verify `REDIS_QUEUE_DB=1` is set correctly in Secrets Manager — jobs and sessions use different Redis databases.

### CloudWatch alarm firing

Alarms publish to `complytude-staging-alarms` SNS → email to `yazan.ali.dev@gmail.com`. Alarm names follow the pattern:

- `complytude-staging-{service}-no-running-tasks` — ECS service has 0 tasks
- `complytude-staging-{service}-high-cpu` — CPU > 80% for 15 minutes
- `complytude-staging-{service}-high-memory` — Memory > 80% for 15 minutes
- `complytude-staging-rds-high-connections` — DB connections high
- `complytude-staging-rds-low-storage` — RDS free storage < 2 GB
- `complytude-staging-redis-low-memory` — Redis freeable memory < 50 MB

View alarm history in CloudWatch → Alarms.

### Terraform state lock stuck

If a `terraform apply` was killed mid-run, the DynamoDB lock may not release:

```bash
# Find the lock ID
aws dynamodb scan \
  --table-name complytude-terraform-locks \
  --region me-central-1

# Force-release (use the LockID from the scan output)
terraform force-unlock <LOCK_ID>
```

---

## Local Docker Development

For local development, NestJS apps run on your host machine and connect to Docker-hosted PostgreSQL and Redis.

```bash
# Start infrastructure services (Postgres + Redis)
pnpm services:up

# Start API with hot-reload
pnpm dev

# Start all apps (API + all workers)
pnpm dev:all

# Full reset (down → up → migrate → seed)
pnpm services:reset
```

**Service endpoints (local):**

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/docs
- Bull Board: http://localhost:3010/admin/queues (own port, `BULL_BOARD_PORT`; open on loopback when `BULL_BOARD_ADMIN_SECRET` is unset)
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

For full Docker-in-Docker (production-like):

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Related Documentation

| Topic | Location |
|---|---|
| System architecture | `docs/ARCHITECTURE.md` |
| Database schema + RLS | `docs/DATABASE.md` |
| RBAC | `docs/RBAC.md` |
| Entitlements | `docs/ENTITLEMENTS.md` |
| Billing + Stripe | `docs/BILLING.md` |
| Test infrastructure | `apps/api/test/README.md` |

---

[Back to Documentation Index](README.md)

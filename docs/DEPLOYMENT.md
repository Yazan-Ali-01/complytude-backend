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
- [Backups and Restore](#backups-and-restore)
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
│  │  SSM port forwarding → RDS    │                                                                   │
│  └───────────────────────────────┘                                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

AWS Services (global / regional, not in VPC):
  ECR:               {account}.dkr.ecr.eu-central-1.amazonaws.com/complytude/{api|worker-*}
  S3 Quarantine:     complytude-staging-quarantine   (raw uploads → GuardDuty malware scan, Textract)
  S3 Clean:          complytude-staging-clean        (validated files + templates)
  Secrets Manager:   complytude/staging/{app,db-app,redis} + RDS-managed master secret
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
| Secrets Manager secrets | `complytude/staging/app`, `complytude/staging/db-app`, `complytude/staging/redis`, RDS-managed master |
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

### Secrets (AWS Secrets Manager)

Terraform creates the secret containers but never their values (except the Redis token, which it generates), so no credential passes through `terraform.tfvars` or Terraform state, and a rotation is not undone by the next apply.

| Secret | Keys | Value set by |
|---|---|---|
| `complytude/staging/app` | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_IDENTITY_SECRET`, `JWT_IDENTITY_REFRESH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `COHERE_API_KEY`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `BULL_BOARD_ADMIN_SECRET` | `scripts/deploy/put-app-secrets.sh` |
| `complytude/staging/db-app` | `DB_APP_PASSWORD` (the `app_login` role) | `scripts/deploy/put-app-secrets.sh --secret db-app` |
| `complytude/staging/redis` | `REDIS_PASSWORD` (ElastiCache AUTH token) | Terraform (generated by the `elasticache` module) |
| RDS-managed (`rds!db-…`) | master `username` / `password` | RDS itself (`manage_master_user_password`); read by the migration pipeline only |

Each service is given only the keys it uses (`infra/modules/ecs/services.tf`) and has its own task role (`infra/modules/ecs/iam.tf`):

| Service | Secrets | AWS permissions (task role) |
|---|---|---|
| API | `DB_APP_PASSWORD`, `REDIS_PASSWORD`, the four JWT keys, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `BULL_BOARD_ADMIN_SECRET` | S3 get/put/delete on both buckets, SES send |
| worker-ai | `DB_APP_PASSWORD`, `REDIS_PASSWORD`, `OPENAI_API_KEY`, `COHERE_API_KEY` | none |
| worker-ingestion | `DB_APP_PASSWORD`, `REDIS_PASSWORD`, `OPENAI_API_KEY` | Textract Start/GetDocumentAnalysis; quarantine get, get-tags, delete; clean put, put-tags, get |
| worker-generation | `DB_APP_PASSWORD`, `REDIS_PASSWORD` | S3 get/put/delete on the clean bucket |

S3 access keys are not used: the tasks sign with their roles.

**First fill, after the first `terraform apply`:**

```bash
# Issued credentials (values from your password manager); signing keys generated
STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… OPENAI_API_KEY=… COHERE_API_KEY=… \
GOOGLE_CLIENT_SECRET=… MICROSOFT_CLIENT_SECRET=… \
  scripts/deploy/put-app-secrets.sh --env staging \
    --generate JWT_ACCESS_SECRET --generate JWT_REFRESH_SECRET \
    --generate JWT_IDENTITY_SECRET --generate JWT_IDENTITY_REFRESH_SECRET \
    --generate BULL_BOARD_ADMIN_SECRET

# The app DB login's password (the deploy pipeline creates the role with it)
scripts/deploy/put-app-secrets.sh --env staging --secret db-app --generate DB_APP_PASSWORD
```

The script merges into the current value, refuses to write a secret that lacks a key the task definitions reference (a task would not start), checks minimum lengths, and never prints a value. `bash scripts/deploy/test-put-app-secrets.sh` tests it against a stub `aws`.

### Rotating a credential

1. **Stripe, OpenAI, Cohere, SSO client secret:** issue the new value at the provider, then `KEY=new scripts/deploy/put-app-secrets.sh --env staging`, then force a new deployment of the services that use it (table above): `aws ecs update-service --cluster complytude-staging --service <service> --force-new-deployment`. Revoke the old value at the provider once the new tasks are healthy. For the Stripe webhook secret, roll it in the Stripe dashboard (it keeps the old one valid for a while), then update the secret.
2. **A JWT signing key:** `--generate JWT_…`, then redeploy the API. Tokens signed with the old key stop working: users signed in with it sign in again (refresh tokens for `JWT_REFRESH_SECRET`/`JWT_IDENTITY_REFRESH_SECRET`).
3. **`DB_APP_PASSWORD`:** generate the new value, set it on the role through the tunnel (`ALTER ROLE app_login PASSWORD '…'` as the master user), then redeploy all four services. Existing pooled connections keep working until they are replaced.
4. **Bull Board secret:** `--generate BULL_BOARD_ADMIN_SECRET`, redeploy the API.
5. **RDS master password:** rotated by RDS (`aws rds modify-db-instance --db-instance-identifier complytude-staging-postgres --rotate-master-user-password --apply-immediately`); the pipeline reads it from the RDS secret each run.
6. **Redis AUTH token:** `terraform apply -replace=module.elasticache.random_password.auth_token[0]`, which updates ElastiCache and the `redis` secret together; then redeploy all four services.

### Plain Environment Variables (ECS Task Definition)

These are not secret and are set directly in the task definition by Terraform (via `terraform.tfvars`). To change them, update `terraform.tfvars` and run `terraform apply`.

**Every task** (`shared_environment` in `infra/environments/staging/main.tf`): `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_APP_USER` (`app_login`), `DB_SSL_ENABLED`/`DB_SSL_REJECT_UNAUTHORIZED` (`true`: verified against the RDS CA bundle, `DB_SSL_CA_PATH=/app/certs/rds-global-bundle.pem`), `DB_IDLE_TIMEOUT`, `DB_CONNECTION_TIMEOUT`, `DB_MAX_CONNECTIONS` (API 10, workers 5; keep (pool × tasks) × 2 under RDS `max_connections`), `REDIS_HOST`, `REDIS_PORT`, `REDIS_TLS`, `REDIS_DB` (0), `REDIS_QUEUE_DB` (1), `REDIS_KEY_PREFIX`, `AWS_REGION`, `S3_REGION`, `S3_ENDPOINT` (empty = AWS), `S3_FORCE_PATH_STYLE`, `COMPLYTUDE_FILES_BUCKET_NAME`/`TEMPLATES_BUCKET_NAME` (clean bucket), `QUARANTINE_BUCKET_NAME`.

**API only**, besides the table below: `CORS_ORIGINS`, `FRONTEND_URL`, `TRUST_PROXY_HOPS`, JWT lifetimes, `SESSION_*`, upload limits and `SIGNED_URL_EXPIRES_IN`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_CATALOG_SYNC_ENABLED`, `STRIPE_TAX_ENABLED`, `BILLING_SCHEDULE_ENABLED`, `FROM_EMAIL`/`FROM_NAME`/`SUPPORT_EMAIL`, the SSO client ids, callback URLs and frontend paths.

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

Use `scripts/deploy/put-app-secrets.sh` (see *Secrets* and *Rotating a credential* above), then force a new deployment of the services that read the key:

```bash
KEY=new-value scripts/deploy/put-app-secrets.sh --env staging
aws ecs update-service --cluster complytude-staging --service complytude-staging-api \
  --force-new-deployment --region eu-central-1
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
quality         lint, type-check, unit and integration tests, dependency audit (ci.yml)
   │
   ▼
migrate         SSM port forwarding → bastion → RDS; setup-roles.sh, run-migrations.sh
   │            (a failed migration stops here: nothing is pushed or deployed)
   ▼
build-and-push  matrix: api, worker-ai, worker-ingestion, worker-generation
   │            pushes :<git-sha> only (ECR tags are immutable); fails on CRITICAL scan findings
   ▼
deploy          scripts/deploy/ecs-deploy.sh --env staging --sha <git-sha>
                new task-definition revision per service, image pinned by digest;
                red if any service's circuit breaker rolls back; then GET /api/health
```

Every image is tagged with the full git SHA and nothing else, so "what is running" is the image
digest in each service's task definition, and it maps back to a commit.

### AWS access for GitHub Actions (OIDC)

The deploy and rollback jobs get short-lived credentials by assuming `complytude-staging-github-deploy` through GitHub's OIDC provider (`infra/modules/github-oidc`). No AWS access key, database password or SSH key is stored in GitHub. The role trusts only jobs that declare `environment: staging` in this repository, and it can do only what the pipeline does:
- push to and inspect the four ECR repositories;
- register task definitions and update the four services (passing only their own roles);
- read the RDS master secret and the `db-app` secret;
- port-forward through the bastion with SSM.

Set up once (after `terraform apply`):

1. **Settings → Environments → New environment → `staging`.** Under *Deployment branches*, allow `development` only (the rollback workflow runs from it too). Add required reviewers for a production environment.
2. **Settings → Secrets and variables → Actions → Variables:**

| Variable | Description |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
| `STAGING_API_URL` | Base URL the deploy smoke-tests, e.g. `https://api-staging.complytude.com`. Unset skips the smoke test. |

3. Delete the old repository secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `BASTION_SSH_KEY` and `STAGING_DB_ADMIN_PASSWORD`. Deactivate and delete the IAM user whose keys they were.

### Concurrency

Only one staging deploy (or rollback) runs at a time. A newer push waits for the running one to finish instead of cancelling it halfway (`cancel-in-progress: false`).

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

Tags are immutable: push each commit once, tagged with its full SHA.

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="${ACCOUNT}.dkr.ecr.eu-central-1.amazonaws.com"
SHA=$(git rev-parse HEAD)

for APP in api worker-ai worker-ingestion worker-generation; do
  docker build -f apps/${APP}/Dockerfile --target production \
    -t "${REGISTRY}/complytude/${APP}:${SHA}" .
  docker push "${REGISTRY}/complytude/${APP}:${SHA}"
  bash scripts/deploy/ecr-scan-gate.sh "complytude/${APP}" "${SHA}"
done
```

### Deploy a SHA

```bash
bash scripts/deploy/ecs-deploy.sh --env staging --sha "${SHA}" --smoke https://api-staging.complytude.com
```

The script registers a new task-definition revision per service (Terraform's latest, with only
the app image changed to `repo@digest`), points the service at it and waits. It exits non-zero if
any service's deployment fails, which means the circuit breaker rolled that service back to its
previous revision. Terraform ignores the services' task definition, so it doesn't undo a deploy.

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

RDS is not publicly accessible. Migrations run through the bastion with SSM Session Manager port forwarding, exactly as the CI/CD pipeline does. There is no SSH key and port 22 is closed: access is by IAM (your SSO session), per person, and every session is logged in Session Manager.

### Prerequisites

- An SSO session with bastion port forwarding (the developer permission set has it; see *Developer access*): `aws sso login --profile complytude-staging`.
- The Session Manager plugin for the AWS CLI: `brew install --cask session-manager-plugin` (macOS) or the package from the AWS docs.

### Open a Tunnel to RDS

```bash
BASTION_ID=$(aws ec2 describe-instances \
  --filters \
    "Name=tag:Name,Values=complytude-staging-bastion" \
    "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text \
  --region eu-central-1)

DB_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier complytude-staging-postgres \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text \
  --region eu-central-1)

# Forwards local :15432 → RDS :5432 through the bastion; leave it running (Ctrl-C closes it)
aws ssm start-session --target "$BASTION_ID" --region eu-central-1 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=${DB_HOST},portNumber=5432,localPortNumber=15432"
```

The master password is in the RDS-managed secret, readable by administrators only (not by the developer permission set):

```bash
MASTER_SECRET=$(aws rds describe-db-instances --db-instance-identifier complytude-staging-postgres \
  --query 'DBInstances[0].MasterUserSecret.SecretArn' --output text --region eu-central-1)
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id "$MASTER_SECRET" \
  --query SecretString --output text --region eu-central-1 | jq -r .password)
```

**Bull Board** (API port 3010, internal only): forward to an API task's private IP the same way, with `host=<task-ip>,portNumber=3010,localPortNumber=3010`.

### Run Migrations

```bash
# With tunnel open on :15432
DB_HOST=localhost \
DB_PORT=15432 \
DB_NAME=complytude \
DB_USER=postgres \
DB_PASSWORD="$DB_PASSWORD" \
  bash scripts/run-migrations.sh
```

### Run Seeds (reference data only)

```bash
DB_HOST=localhost \
DB_PORT=15432 \
DB_NAME=complytude \
DB_USER=postgres \
DB_PASSWORD="$DB_PASSWORD" \
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

Locally (or through the tunnel, with the target environment's variables set):

```bash
pnpm admin:grant you@company.com                    # system_admin (default)
pnpm admin:grant auditor@company.com --role auditor # support | auditor
```

The command exits non-zero, and changes nothing, if the account exists but its email isn't verified.

### Close the Tunnel

Stop the `aws ssm start-session` command (Ctrl-C).

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

### Automatic Rollback

Every service has the ECS deployment circuit breaker with rollback: if the new tasks keep failing
their health checks, ECS puts the service back on the previous revision (the previous image
digest). The deploy job then fails (the rollout state is `FAILED`), so a rolled-back deploy is
never green.

### Roll Back to an Earlier Commit

Redeploy the images of the commit you want back. From GitHub:

```bash
gh workflow run rollback-staging.yml -f sha=<git-sha>
```

or from a machine with AWS credentials:

```bash
bash scripts/deploy/ecs-deploy.sh --env staging --sha <git-sha>
```

Find candidate SHAs with `git log --oneline development` or in ECR (the last 30 images per app are
kept). Migrations are forward-only and are **not** rolled back: the older code runs against the
current schema, so a migration that the older code can't work with needs a fix-forward instead.

### Rollback a Bad Migration

Applied migrations are never edited: the runner (`scripts/migrate.ts`) refuses to run if an applied
file's checksum changed. A migration that failed was rolled back with its bookkeeping row (one
transaction), so fix the file and re-run. A migration that applied but is wrong is undone by a
**new** migration (its commented rollback block is the starting point), deployed like any other:

```bash
# Verify applied migrations are unchanged, without applying anything
DB_HOST=localhost DB_PORT=15432 DB_NAME=complytude \
  DB_USER=postgres DB_PASSWORD=<password> \
  bash scripts/run-migrations.sh --check
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

## Backups and Restore

### What is backed up

| Data | Backup | Kept | Recovery point (RPO) |
|---|---|---|---|
| PostgreSQL (RDS) | Automated daily snapshots plus transaction logs: restore to any second in the window (point-in-time restore). Tags copied to snapshots; backups survive an instance delete; final snapshot on destroy (production). | 14 days by default (`backup_retention_days`, 1-35); staging 7 | ~5 minutes (log upload interval) |
| Documents and templates (S3 quarantine, clean) | Versioning: an overwritten or deleted object keeps its previous version | 30 days (`noncurrent_version_days`) | Zero for overwrites and deletes inside the window |
| Redis (sessions, queues) | Daily snapshot | 7 days by default; staging 1 | Up to 24 hours. Sessions lost after a restore just mean signing in again; stuck jobs are re-driven by the stuck-work sweep. |

**Recovery time target (RTO): 1 hour** for a database restore, to be confirmed by the drill below.

### Restore PostgreSQL to a point in time

A restore creates a **new** instance; the broken one is left untouched until you swap them.

```bash
ENV=staging
DB=complytude-${ENV}-postgres
TIME=2026-09-29T08:15:00Z   # just before the damage, UTC

SUBNETS=$(aws rds describe-db-instances --db-instance-identifier $DB \
  --query 'DBInstances[0].DBSubnetGroup.DBSubnetGroupName' --output text)
SGS=$(aws rds describe-db-instances --db-instance-identifier $DB \
  --query 'DBInstances[0].VpcSecurityGroups[].VpcSecurityGroupId' --output text)

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier $DB \
  --target-db-instance-identifier ${DB}-restored \
  --restore-time $TIME \
  --db-subnet-group-name $SUBNETS \
  --vpc-security-group-ids $SGS \
  --no-publicly-accessible
aws rds wait db-instance-available --db-instance-identifier ${DB}-restored
```

1. **Check the data** on the restored instance through the tunnel (see "Open a Tunnel to RDS"), with its own endpoint (`aws rds describe-db-instances --db-instance-identifier ${DB}-restored --query 'DBInstances[0].Endpoint.Address'`).
2. **Stop writes:** scale the API and workers to 0 (`aws ecs update-service --cluster complytude-${ENV} --service complytude-${ENV}-<app> --desired-count 0`).
3. **Swap by renaming**, so the endpoint the app and Terraform use stays the same:
   ```bash
   aws rds modify-db-instance --db-instance-identifier $DB \
     --new-db-instance-identifier ${DB}-broken --apply-immediately
   aws rds wait db-instance-available --db-instance-identifier ${DB}-broken
   aws rds modify-db-instance --db-instance-identifier ${DB}-restored \
     --new-db-instance-identifier $DB --apply-immediately
   aws rds wait db-instance-available --db-instance-identifier $DB
   ```
4. **Start the services again** (restore the desired counts) and check `GET /api/health`.
5. Run `terraform plan`: settings the restore did not copy (Performance Insights, backup window, deletion protection) show up as changes; apply them. Delete `${DB}-broken` once nothing more is needed from it.

### Restore a document or template from S3

```bash
BUCKET=complytude-${ENV}-clean
KEY=tenants/<tenant-id>/documents/<document-id>/contract.pdf

# Versions and delete markers of the object, newest first
aws s3api list-object-versions --bucket $BUCKET --prefix $KEY \
  --query '{versions: Versions[].[VersionId, LastModified, IsLatest], deletes: DeleteMarkers[].[VersionId, LastModified, IsLatest]}'

# Deleted: remove the delete marker and the previous version is current again
aws s3api delete-object --bucket $BUCKET --key $KEY --version-id <delete-marker-version-id>

# Overwritten: copy the good version back on top
aws s3api copy-object --bucket $BUCKET --key $KEY \
  --copy-source "${BUCKET}/${KEY}?versionId=<good-version-id>"
```

### Restore Redis

Losing Redis loses sessions (users sign in again) and queued jobs (the stuck-work sweep re-drives
documents and analyses stuck in `processing`). A restore from a snapshot is only worth it for a
large backlog of queued work: `aws elasticache create-replication-group --snapshot-name <name>`
creates a new group, and `REDIS_HOST` in the app secret must then point to it.

### Restore drill

Run one timed drill per environment before production launch, then every quarter: restore the
database to a point in time, swap it in, restore one deleted S3 object, and record the results.

| Date | Environment | Restored to | Time to healthy API (RTO) | Data lost (RPO) | By | Notes |
|---|---|---|---|---|---|---|
| _not yet performed_ | | | | | | |
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

## Email (SES)

`infra/modules/ses` sets up sending for `complytude.com`:
- **DNS**, in the Route 53 zone this state manages:
  - the verification TXT (`_amazonses`) and the three DKIM CNAMEs, so SES verifies the domain and signs every message;
  - the custom MAIL FROM `mail.complytude.com`, with its MX (bounces) and `v=spf1 include:amazonses.com -all`, so SPF aligns without touching the root domain's TXT records;
  - a DMARC record, `p=none` (reports only) to start.
- **Configuration set** `complytude-staging`: the API names it on every send (`SES_CONFIGURATION_SET`). It counts send, delivery, bounce, complaint and reject events in CloudWatch per `EmailType`, and publishes every bounce and complaint to the SNS topic `complytude-staging-ses-feedback` (`feedback_emails` subscribes addresses).
- **Suppression:** the account-level suppression list covers bounces and complaints. An address that hard-bounced or complained is not mailed again: SES drops the message and records a bounce.
- **Alarms:** `Reputation.BounceRate` ≥ 3 % and `Reputation.ComplaintRate` ≥ 0.05 % notify the alarm topic. SES reviews the account at 5 % / 0.1 % and can pause sending at 10 % / 0.5 %.

Tighten DMARC to `quarantine`, then `reject` (`dmarc_policy`), once the aggregate reports (`dmarc_report_email`) show every legitimate sender passing.

### Leaving the SES sandbox (one-off, account owner)

A new account can only send to verified addresses, so verification and password-reset mail doesn't reach users until production access is granted. Request it once per region, after the domain shows **Verified** with DKIM **Successful** in SES:

```bash
aws sesv2 put-account-details --region eu-central-1 \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url https://complytude.com \
  --contact-language EN \
  --use-case-description "Transactional email for a B2B compliance SaaS: account verification, password reset, team invitations and billing notices, to users who signed up. Bounces and complaints are handled with the SES account suppression list and a configuration set with event publishing; bounce and complaint rates are alarmed in CloudWatch." \
  --additional-contact-email-addresses ops@complytude.com
```

AWS answers within about a day (Support case in the console). Check with `aws sesv2 get-account --region eu-central-1 --query ProductionAccessEnabled`.

---

## Developer Access (IAM Identity Center)

No IAM users or access keys exist for people. Developers sign in with IAM Identity Center and get short-lived credentials for the `complytude-staging-developer` permission set (`infra/modules/developers`). It allows:
- logs;
- ECS, RDS and ElastiCache read access;
- ECR pull (no push: images come from CI);
- S3 read on the staging buckets;
- Textract, for local development;
- port forwarding through the bastion.

It denies IAM writes, the Terraform state bucket and secret writes.

Set up once (account administrator):

1. Enable IAM Identity Center in the account (console), create a group (e.g. `complytude-developers`) and add the developers.
2. Set `developers_identity_center_group_id` in `terraform.tfvars` to the group's id and `terraform apply`.

Each developer:

```bash
aws configure sso --profile complytude-staging     # start URL from the administrator; pick the developer permission set
aws sso login --profile complytude-staging
export AWS_PROFILE=complytude-staging              # the AWS SDK in the apps and scripts uses it
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
terraform output bastion_instance_id
terraform output ecr_repository_urls
terraform output github_deploy_role_arn
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
SOME_KEY=new-value scripts/deploy/put-app-secrets.sh --env staging
aws ecs update-service --cluster complytude-staging --service complytude-staging-api \
  --force-new-deployment --region eu-central-1
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
- **Secret not found** (`ResourceInitializationError … secrets`): verify `complytude/staging/app` and `complytude/staging/db-app` have values with every key (`scripts/deploy/put-app-secrets.sh` refuses to write one without them)
- **Image pull failure**: check that an image tagged with the deployed SHA exists in each repository (`aws ecr describe-images --repository-name complytude/api --image-ids imageTag=<sha>`)
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
# Verify the DB is accepting connections: open the tunnel (see "Open a Tunnel to RDS"), then
pg_isready -h localhost -p 15432

# Check RDS status in console
aws rds describe-db-instances \
  --db-instance-identifier complytude-staging-postgres \
  --query 'DBInstances[0].DBInstanceStatus' \
  --region eu-central-1
```

If the ECS task's DB credentials are wrong, set `DB_APP_PASSWORD` in `complytude/staging/db-app` (and on the role; see *Rotating a credential*) and force a new deployment.

### Redis connection errors

```bash
# Check ElastiCache cluster status
aws elasticache describe-cache-clusters \
  --region eu-central-1 \
  --query 'CacheClusters[?contains(CacheClusterId, `staging`)]'

# Redis admits the ECS tasks only (not the bastion): the API's readiness check reports it
curl -s https://api-staging.complytude.com/api/health/ready
```

### BullMQ jobs not processing

```bash
# Queue depths: the API publishes them every minute (queue-metrics job, CloudWatch alarms), and
# Bull Board shows them (see "Open a Tunnel to RDS" → Bull Board)

# Check worker logs for job pickup
aws logs tail /ecs/complytude-staging/worker-ai \
  --follow --since 10m --region eu-central-1
```

If workers are healthy but not picking up jobs, verify `REDIS_QUEUE_DB=1` in the task definitions' environment — jobs and sessions use different Redis databases.

### CloudWatch alarm firing

Alarms publish to the `complytude-staging-alarms` SNS topic, whose subscribers (`alarm_email`) must have confirmed the subscription email; the external uptime alarm uses a topic of the same name in us-east-1 (Route 53 metrics live there). Every alarm also notifies when it recovers. Names:

- `complytude-staging-{service}-no-running-tasks`: an ECS service has 0 tasks
- `complytude-staging-{service}-high-cpu` / `-high-memory`: > 80% of reserved for 15 minutes (`AWS/ECS`)
- `complytude-staging-alb-5xx` / `-api-5xx`: more than 10 5xx responses in 5 minutes from the load balancer / the API
- `complytude-staging-api-latency-p95`: p95 response time > 2 s for 15 minutes
- `complytude-staging-api-unhealthy-targets`: an API task fails readiness (database, Redis or queues unreachable)
- `complytude-staging-api-uptime`: `https://api-staging.<domain>/api/health/ready` failing from outside AWS
- `complytude-staging-rds-high-connections` / `-low-storage` / `-high-cpu` / `-low-memory`
- `complytude-staging-redis-memory` / `-evictions`: Redis above 80% of maxmemory / evicting keys
- `complytude-staging-{app}-errors`: more than 20 error-level log lines in 5 minutes
- `complytude-staging-queue-{queue}-backlog` / `-stuck` / `-failed`: 500+ jobs waiting for 15 minutes / a job waiting over 15 minutes (its consumer stopped) / 5+ jobs failed for good in 5 minutes (from the API's `queue-metrics` log lines)

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

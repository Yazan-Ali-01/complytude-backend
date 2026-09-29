# Complytude Infrastructure (Terraform)

All AWS infrastructure for Complytude is managed here with Terraform.

## Structure

```
infra/
├── modules/          # Reusable building blocks (one per AWS service)
│   ├── networking/   # VPC, subnets, security groups
│   ├── rds/          # PostgreSQL (Aurora Serverless)
│   ├── elasticache/  # Redis
│   ├── s3/           # S3 buckets
│   ├── ecr/          # Container registries
│   ├── ecs/          # ECS cluster, services, task definitions
│   ├── alb/          # Application load balancer
│   ├── secrets/      # AWS Secrets Manager for application secrets
│   └── monitoring/   # CloudWatch alarms and dashboards
└── environments/
    ├── staging/      # Staging environment
    └── production/   # Production environment
```

Modules are reusable building blocks. Environments wire them together with real values.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5.0
- [AWS CLI](https://aws.amazon.com/cli/) configured with `complytude-admin` credentials
- AWS region: `eu-central-1` (Spain)

## Remote State

State is stored in S3 with DynamoDB locking — both were created manually (one-time bootstrap):

| Resource       | Name                         |
| -------------- | ---------------------------- |
| S3 bucket      | `complytude-terraform-state` |
| DynamoDB table | `complytude-terraform-locks` |

Each environment has its own state key:

- Staging: `staging/terraform.tfstate`
- Production: `production/terraform.tfstate`

## Working with an environment

```bash
cd infra/environments/staging

# First time (or after adding new providers)
terraform init

# See what will change
terraform plan

# Apply changes
terraform apply

# Tear down (staging only — never run in production without approval)
terraform destroy
```

## Variables

Each environment has a `terraform.tfvars.example`. Copy it to `terraform.tfvars` and fill in the values before running any commands.

```bash
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
```

> `terraform.tfvars` is gitignored. Never commit it — it may contain secrets.

## Secrets Manager

Application secrets (DB, JWT, Redis, S3) are stored in AWS Secrets Manager as a single JSON secret: `complytude/<env>/app`.

**Required tfvars:** `app_db_password`, `jwt_*_secret`, `bull_board_admin_secret` (at least 32 characters, `openssl rand -hex 32`), `cors_origins`, `alarm_email` (for CloudWatch alarm notifications). For S3, use `s3_access_key`/`s3_secret_key` or leave empty to use ECS task role.

**Using app_login (production-like):** After RDS is up, run `scripts/setup-app-user-role.sql` via bastion SSH tunnel:

```bash
PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5432 -U postgres -d complytude \
  -v app_user="'app_login'" -v app_password="'YOUR_APP_PASSWORD'" -v db_name="complytude" \
  -f scripts/setup-app-user-role.sql
```

Use the same `app_password` as `app_db_password` in tfvars.

**ECS integration:** The ECS module attaches `ecs_secrets_policy_arn` to the task execution role and injects all app secrets via the task definition `secrets` block (format: `valueFrom = "${secret_arn}:KEY::"`).

**OAuth2 SSO (Google / Microsoft):** Optional keys `GOOGLE_*`, `MICROSOFT_*`, `SSO_FRONTEND_*` are included in the same JSON secret (defaults empty = SSO disabled in the API). The SPA base URL comes from the required `frontend_url` variable and reaches the API as `FRONTEND_URL` (task environment); email links and post-OAuth redirects use it, and the API refuses to boot in production without an https value.

**Rotation:** Update the secret in AWS Console or via `aws secretsmanager put-secret-value`. Terraform will overwrite on next apply — for rotation, use AWS Console or a separate rotation Lambda.

## Bull Board (queue dashboard)

Bull Board is not behind the ALB: `https://<api>/admin/queues` returns 404. The API serves it on its internal port 3010 (`local.bull_board_port` in the environment's `main.tf`). The ECS security group admits that port from the bastion's security group only, and `BULL_BOARD_ADMIN_SECRET` goes to the API task only (never the workers). To open it, tunnel through the bastion to an API task:

```bash
CLUSTER=$(terraform output -raw ecs_cluster_name)
TASK=$(aws ecs list-tasks --cluster $CLUSTER --service-name $CLUSTER-api --query 'taskArns[0]' --output text)
TASK_IP=$(aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK \
  --query "tasks[0].attachments[0].details[?name=='privateIPv4Address'].value" --output text)
ssh -i ~/.ssh/<bastion-key>.pem -N -L 3010:$TASK_IP:3010 ec2-user@$(terraform output -raw bastion_public_ip)
```

Then open `http://localhost:3010/admin/queues`. The browser asks for credentials: any username, with `bull_board_admin_secret` as the password. From the command line, send `Authorization: Bearer <secret>` or `X-Admin-Secret: <secret>` instead.

## ECS Deployment (Build, Push, Apply)

After `terraform apply` creates the ECS cluster and services, push Docker images to ECR and ECS will pull them:

```bash
# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=eu-central-1
ECR_BASE=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_BASE

# Images are tagged with the full git SHA only (ECR tags are immutable)
SHA=$(git rev-parse HEAD)
for APP in api worker-ai worker-ingestion worker-generation; do
  docker build -f apps/$APP/Dockerfile -t $ECR_BASE/complytude/$APP:$SHA --target production .
  docker push $ECR_BASE/complytude/$APP:$SHA
done

# First apply: create the services with that SHA (ecs_image_tag in terraform.tfvars).
# Every later deploy or rollback: scripts/deploy/ecs-deploy.sh --env staging --sha <sha>
```

Verify: `http://$(terraform output -raw alb_dns_name)/api/health` should return 200.

## Monitoring (CloudWatch Alarms)

The monitoring module creates CloudWatch alarms for ECS (running tasks, CPU, memory), RDS (connections, storage), and Redis (memory). Alarms send email via SNS.

**After first apply:** Check your `alarm_email` inbox and click the SNS subscription confirmation link — alarms won't notify until confirmed.

## Adding a new module

1. Create `infra/modules/<name>/{main.tf,variables.tf,outputs.tf}`
2. Call the module from the relevant environment's `main.tf`
3. Expose outputs in the environment's `outputs.tf` if needed

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

Secrets live in AWS Secrets Manager: `complytude/<env>/app` (issued credentials), `complytude/<env>/db-app` (the app DB login's password), `complytude/<env>/redis` (the generated AUTH token) and the RDS-managed master secret. Terraform creates the containers; set the values with `scripts/deploy/put-app-secrets.sh` after the first apply (`docs/DEPLOYMENT.md` → *Secrets*). No secret value goes in `terraform.tfvars`.

**Required tfvars:** `cors_origins`, `frontend_url`, `alarm_email` (for CloudWatch alarm notifications). S3 is accessed with each task's IAM role.

**Using app_login (production-like):** After RDS is up, run `scripts/setup-app-user-role.sql` through the SSM tunnel (`docs/DEPLOYMENT.md` → *Open a Tunnel to RDS*):

```bash
PGPASSWORD=$DB_PASSWORD psql -h localhost -p 15432 -U postgres -d complytude \
  -v app_user="app_login" -v app_password="YOUR_APP_PASSWORD" -v db_name="complytude" \
  -f scripts/setup-app-user-role.sql
```

Use the value in the `db-app` secret as `app_password` (the deploy pipeline does this itself: `scripts/setup-roles.sh`).

**ECS integration:** The ECS module attaches `ecs_secrets_policy_arn` to the task execution role and injects, per service, only the keys that service uses (format: `valueFrom = "<secret arn>:KEY::"`); each service has its own task role.

**OAuth2 SSO (Google / Microsoft):** The client ids, callback URLs and `SSO_FRONTEND_*` paths are plain API environment (tfvars; empty client id = provider disabled); the client secrets are in the app secret. The SPA base URL comes from the required `frontend_url` variable and reaches the API as `FRONTEND_URL` (task environment); email links and post-OAuth redirects use it, and the API refuses to boot in production without an https value.

**Rotation:** Terraform creates the secret containers only; values are set with `scripts/deploy/put-app-secrets.sh`, so an apply never overwrites a rotated value. Runbook: `docs/DEPLOYMENT.md` → *Rotating a credential*.

## Bull Board (queue dashboard)

Bull Board is not behind the ALB: `https://<api>/admin/queues` returns 404. The API serves it on its internal port 3010 (`local.bull_board_port` in the environment's `main.tf`). The ECS security group admits that port from the bastion's security group only, and `BULL_BOARD_ADMIN_SECRET` goes to the API task only (never the workers). To open it, port-forward through the bastion with SSM Session Manager (no SSH key; see `docs/DEPLOYMENT.md` → *Open a Tunnel to RDS* for the prerequisites):

```bash
CLUSTER=$(terraform output -raw ecs_cluster_name)
TASK=$(aws ecs list-tasks --cluster $CLUSTER --service-name $CLUSTER-api --query 'taskArns[0]' --output text)
TASK_IP=$(aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK \
  --query "tasks[0].attachments[0].details[?name=='privateIPv4Address'].value" --output text)
aws ssm start-session --target $(terraform output -raw bastion_instance_id) \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$TASK_IP,portNumber=3010,localPortNumber=3010"
```

Then open `http://localhost:3010/admin/queues`. The browser asks for credentials: any username, with the `BULL_BOARD_ADMIN_SECRET` value from the app secret as the password. From the command line, send `Authorization: Bearer <secret>` or `X-Admin-Secret: <secret>` instead.

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

The monitoring module creates CloudWatch alarms for ECS (running tasks, CPU and memory as a percentage of reserved), the load balancer (5xx, p95 latency, API tasks failing readiness), RDS (connections, storage, CPU, memory), Redis (memory, evictions), error-level log lines per app, every BullMQ queue (backlog, oldest waiting job, failures; from the API's `queue-metrics` log lines) and an external Route 53 uptime check of `/api/health/ready` (alarm in us-east-1, so the root module passes an `aws.us_east_1` provider), and SES sender reputation (bounce and complaint rates, well below SES's review thresholds). Every alarm notifies on firing and on recovery, by email via SNS (`alarm_emails`).

**After first apply:** every address gets **two** SNS confirmation emails (the main region and us-east-1). Click both, or the alarms reach nobody. Prefer a shared on-call address to one person's inbox.

## Adding a new module

1. Create `infra/modules/<name>/{main.tf,variables.tf,outputs.tf}`
2. Call the module from the relevant environment's `main.tf`
3. Expose outputs in the environment's `outputs.tf` if needed

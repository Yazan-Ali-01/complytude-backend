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
│   └── monitoring/   # CloudWatch alarms and dashboards
└── environments/
    ├── staging/      # Staging environment
    └── production/   # Production environment
```

Modules are reusable building blocks. Environments wire them together with real values.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5.0
- [AWS CLI](https://aws.amazon.com/cli/) configured with `complytude-admin` credentials
- AWS region: `me-central-1`

## Remote State

State is stored in S3 with DynamoDB locking — both were created manually (one-time bootstrap):

| Resource | Name |
|---|---|
| S3 bucket | `complytude-terraform-state` |
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

## Adding a new module

1. Create `infra/modules/<name>/{main.tf,variables.tf,outputs.tf}`
2. Call the module from the relevant environment's `main.tf`
3. Expose outputs in the environment's `outputs.tf` if needed

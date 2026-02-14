# Deployment Guide

This guide covers deploying Complytude to production environments.

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [Production Environment](#production-environment)
- [Environment Variables](#environment-variables)
- [Health Checks](#health-checks)
- [Monitoring](#monitoring)

---

## Docker Deployment

Complytude supports two Docker deployment approaches to fit different workflows and environments.

### Overview: Two Deployment Approaches

| Aspect                 | Hybrid Mode               | Fully Dockerized           |
| ---------------------- | ------------------------- | -------------------------- |
| **NestJS Application** | 💻 Local (Node.js)        | 🐳 Docker Container        |
| **PostgreSQL**         | 🐳 Docker Container       | 🐳 Docker Container        |
| **MinIO**              | 🐳 Docker Container       | 🐳 Docker Container        |
| **Hot Reload**         | ✅ Native & Fast          | ⚠️ Via Volume Mounts       |
| **Debugging**          | ✅ Direct IDE Integration | ⚠️ Remote Debugging        |
| **Production-like**    | ⚠️ Partial                | ✅ Identical to Production |
| **Startup Time**       | ⚡ Fast                   | 🐌 Slower (image build)    |
| **Best For**           | Active Development        | Staging Deployments, CI/CD |
| **Command**            | `pnpm dev`                | `pnpm docker:up:full`      |

### Approach 1: Hybrid Mode (Recommended for Development)

**What it is:** NestJS runs locally with hot-reload, while databases and services run in Docker.

**Advantages:**

- ✅ Fast hot-reload for rapid development
- ✅ Easy debugging with IDE breakpoints
- ✅ Native Node.js performance
- ✅ Quick startup time

**Quick Start:**

```bash
# That's it! This command automatically:
# 1. Checks if Docker services are running
# 2. Starts PostgreSQL and MinIO if needed
# 3. Starts NestJS with hot-reload
pnpm dev
```

**What happens under the hood:**

```bash
pnpm dev
  → scripts/start-dev.sh
    → Checks Docker services
    → Starts services if needed (pnpm docker:start)
    → Runs pnpm start:dev (NestJS with hot-reload)
```

**Environment Configuration:**

In your `.env` file, use `localhost` for service connections:

```bash
DB_HOST=localhost          # Connect to Postgres in Docker
DB_PORT=5432
S3_ENDPOINT=http://localhost:9000  # Connect to MinIO in Docker
```

**Available Services:**

- 🚀 API: http://localhost:3000/api
- 📚 Swagger: http://localhost:3000/docs
- 🗄️ PostgreSQL: `localhost:5432`
- 📦 MinIO Console: http://localhost:9001

**Manual Control (Optional):**

If you prefer manual control over services:

```bash
# Start services only
pnpm docker:start

# Start NestJS manually
pnpm start:dev

# Stop services
pnpm docker:stop
```

---

### Approach 2: Fully Dockerized (Production-like)

**What it is:** Everything runs in Docker containers, including the NestJS application.

**Advantages:**

- ✅ Production-like environment
- ✅ Consistent across team members
- ✅ Perfect for CI/CD pipelines
- ✅ Easy deployment validation

**When to use:**

- Validating Docker deployment before production
- CI/CD pipelines
- Onboarding new developers (no local Node.js setup needed)
- Debugging Docker-specific issues

**Step 1: Build the Docker Image**

```bash
# Build production image
pnpm docker:build

# Or build development image (with dev dependencies)
pnpm docker:build:dev
```

The Dockerfile uses multi-stage builds for optimal image size:

- **Stage 1:** Install dependencies (cached)
- **Stage 2:** Build TypeScript
- **Stage 3:** Production runtime (minimal, ~150MB)

**Step 2: Start All Services**

```bash
# Start everything (PostgreSQL + MinIO + NestJS)
pnpm docker:up:full
```

This uses Docker Compose profiles to start the `app` service along with all dependencies.

**Step 3: Verify Everything is Running**

```bash
# Check container status
docker ps

# View logs from all services
pnpm docker:logs:full

# View app logs only
pnpm docker:logs:app

# Check health
curl http://localhost:3000/api/health
```

**Environment Configuration:**

In your `.env` file, use Docker service names for inter-container communication:

```bash
DB_HOST=postgres           # Use service name, not localhost
DB_PORT=5432
S3_ENDPOINT=http://minio:9000  # Use service name, not localhost
```

**Available Services:**

- 🚀 API: http://localhost:3000/api
- 📚 Swagger: http://localhost:3000/docs
- 🗄️ PostgreSQL: `localhost:5432` (from host)
- 📦 MinIO Console: http://localhost:9001

**Stopping Services:**

```bash
# Stop all containers (keeps data)
pnpm docker:down:full

# Stop and remove all data (fresh start)
pnpm docker:reset
```

---

### Docker Compose Services Reference

| Service    | Container Name      | Default Port | Profile      | Description            |
| ---------- | ------------------- | ------------ | ------------ | ---------------------- |
| `postgres` | complytude-postgres | 5432         | (default)    | PostgreSQL 16 database |
| `minio`    | complytude-minio    | 9000, 9001   | (default)    | S3-compatible storage  |
| `pgadmin`  | complytude-pgadmin  | 5050         | `tools`      | Database management UI |
| `app`      | complytude-app      | 3000         | `full-stack` | NestJS API             |

**Starting specific services:**

```bash
# Services only (default - hybrid mode)
docker-compose up -d

# Services + pgAdmin
pnpm docker:up:all

# Everything including the app
pnpm docker:up:full
```

---

### Building the Docker Image

The project includes a production-optimized Dockerfile with multi-stage builds.

**Build Commands:**

```bash
# Production build (default, minimal image)
docker build -t complytude-api:production .

# Development build (includes dev dependencies)
docker build -t complytude-api:dev --target development .

# Using pnpm scripts (recommended)
pnpm docker:build      # Production
pnpm docker:build:dev  # Development
```

**Image Optimization Features:**

- ✅ Multi-stage build (smaller final image)
- ✅ Layer caching for faster rebuilds
- ✅ Non-root user for security
- ✅ Health checks built-in
- ✅ Signal handling with dumb-init

**Image Sizes:**

- Production image: ~150MB (Node 22.16.0 Alpine + compiled code)
- Development image: ~300MB (includes TypeScript, dev tools)

---

### Environment Variables for Docker

**Key Differences Between Modes:**

| Variable      | Hybrid Mode             | Fully Dockerized    |
| ------------- | ----------------------- | ------------------- |
| `DB_HOST`     | `localhost`             | `postgres`          |
| `S3_ENDPOINT` | `http://localhost:9000` | `http://minio:9000` |

**Complete Environment Variables for Hybrid Mode:**

```bash
# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api
CORS_ORIGINS=http://localhost:3000

# Database (use localhost for hybrid mode)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=complytude
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000

# JWT Authentication
JWT_ACCESS_SECRET=your-super-secret-jwt-access-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-jwt-refresh-key-change-this-in-production
JWT_IDENTITY_SECRET=your-super-secret-jwt-identity-key-change-this-in-production
JWT_IDENTITY_REFRESH_SECRET=your-super-secret-jwt-identity-refresh-key-change-this-in-production
JWT_REFRESH_HASH_SECRET=your-super-secret-jwt-refresh-hash-key-change-this-in-production
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=14d
JWT_IDENTITY_EXPIRES_IN=15m
JWT_IDENTITY_REFRESH_EXPIRES_IN=14d

# S3/MinIO Storage (use localhost for hybrid mode)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_PREFIX=complytude
S3_FORCE_PATH_STYLE=true
MAX_FILE_SIZE=10485760
SIGNED_URL_EXPIRES_IN=900

# MinIO (Docker Service)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
```

**Why the difference?**

- In hybrid mode, NestJS runs on your host machine and connects to Docker services via `localhost`
- In fully dockerized mode, NestJS runs in a container and uses Docker networking (service names)

**Automatic Configuration:**

The `docker-compose.yml` is pre-configured with the correct values for fully dockerized mode. When you run `pnpm docker:up:full`, it automatically overrides:

- `DB_HOST` → `postgres`
- `S3_ENDPOINT` → `http://minio:9000`

You don't need to change your `.env` file between modes!

**Production Environment Variables:**

See [Environment Variables](#environment-variables) section below for production configuration.

---

### Troubleshooting Docker Issues

**Services not starting?**

```bash
# Check Docker is running
docker info

# View logs
pnpm docker:logs

# Restart services
pnpm docker:stop
pnpm docker:start
```

**App container failing in full-stack mode?**

```bash
# Check app logs
pnpm docker:logs:app

# Common issues:
# 1. Database not ready - wait a few seconds
# 2. Environment variables incorrect - check .env
# 3. Port conflict - change PORT in .env

# Rebuild if code changes aren't reflected
pnpm docker:build
pnpm docker:up:full
```

**Port conflicts?**

```bash
# Change ports in .env
PORT=3001
DB_PORT=5433
MINIO_PORT=9002

# Restart services
pnpm docker:stop
pnpm docker:start
```

**Need a completely fresh start?**

```bash
# Nuclear option: delete everything and start fresh
pnpm docker:reset
pnpm db:migrate

# For full-stack mode
pnpm docker:build
pnpm docker:up:full
```

**Volume permission issues (Linux)?**

```bash
# If you see permission errors with mounted volumes
sudo chown -R $USER:$USER ./src ./node_modules
```

---

### CI/CD with Docker

**Example GitHub Actions workflow:**

```yaml
name: CI/CD

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker image
        run: docker build -t complytude-api:ci .

      - name: Start services
        run: docker-compose --profile full-stack up -d

      - name: Wait for health check
        run: |
          timeout 60 bash -c 'until curl -f http://localhost:3000/api/health; do sleep 2; done'

      - name: Cleanup
        run: docker-compose down -v
```

---

## Production Environment

### Step-by-Step Setup

1. **Create production environment file**:

   ```bash
   cp .env.example .env.production
   ```

2. **Update environment variables** (see [Environment Variables](#environment-variables))

3. **Build the application**:

   ```bash
   pnpm build
   ```

4. **Run database migrations**:

   ```bash
   NODE_ENV=production pnpm db:migrate
   ```

5. **Start the application**:
   ```bash
   NODE_ENV=production pnpm start:prod
   ```

### Production Considerations

- ✅ Use a managed PostgreSQL service (AWS RDS, Azure Database, etc.)
- ✅ Use AWS S3 instead of MinIO for storage
- ✅ Set strong, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- ✅ Configure proper CORS origins
- ✅ Enable HTTPS via reverse proxy (nginx, AWS ALB, etc.)
- ✅ Set up proper logging and monitoring
- ✅ Configure database connection pooling
- ✅ Use secrets management (AWS Secrets Manager, HashiCorp Vault)

---

## Environment Variables

### Required Production Variables

```bash
# Application
NODE_ENV=production
PORT=3000
API_PREFIX=api

# CORS - Set your actual frontend domains
CORS_ORIGINS=https://app.complytude.com,https://admin.complytude.com

# Database - Use managed PostgreSQL
DB_HOST=your-db-host.rds.amazonaws.com
DB_PORT=5432
DB_NAME=complytude_production
DB_USER=complytude_prod
DB_PASSWORD=<strong-password>
DB_MAX_CONNECTIONS=50
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000

# JWT - Use strong random secrets
JWT_ACCESS_SECRET=<generate-with-openssl-rand-base64-64>
JWT_REFRESH_SECRET=<generate-with-openssl-rand-base64-64>
JWT_IDENTITY_SECRET=<generate-with-openssl-rand-base64-64>
JWT_IDENTITY_REFRESH_SECRET=<generate-with-openssl-rand-base64-64>
JWT_REFRESH_HASH_SECRET=<generate-with-openssl-rand-base64-64>
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=14d
JWT_IDENTITY_EXPIRES_IN=15m
JWT_IDENTITY_REFRESH_EXPIRES_IN=14d

# S3 Storage - Use AWS S3 in production
S3_REGION=us-east-1
S3_ACCESS_KEY=<your-aws-access-key>
S3_SECRET_KEY=<your-aws-secret-key>
S3_BUCKET_PREFIX=complytude-production
S3_FORCE_PATH_STYLE=false
# Note: Don't set S3_ENDPOINT for AWS S3 (leave empty or omit)

# File Upload
MAX_FILE_SIZE=10485760
SIGNED_URL_EXPIRES_IN=900
```

### Generating Secrets

```bash
# Generate JWT secrets (use different values for each)
openssl rand -base64 64  # JWT_ACCESS_SECRET
openssl rand -base64 64  # JWT_REFRESH_SECRET
openssl rand -base64 64  # JWT_IDENTITY_SECRET
openssl rand -base64 64  # JWT_IDENTITY_REFRESH_SECRET
openssl rand -base64 64  # JWT_REFRESH_HASH_SECRET

# Generate database password
openssl rand -base64 32
```

---

## Health Checks

### Available Endpoints

| Endpoint                  | Description           | Use Case                   |
| ------------------------- | --------------------- | -------------------------- |
| `GET /api/health`         | Overall health status | Load balancer health check |
| `GET /api/health/db`      | Database connectivity | Database monitoring        |
| `GET /api/health/storage` | Storage connectivity  | Storage monitoring         |

### Example Health Check Responses

**Healthy Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "database": "healthy",
    "storage": "healthy"
  }
}
```

**Unhealthy Response:**

```json
{
  "status": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "database": "unhealthy",
    "storage": "healthy"
  },
  "error": "Database connection failed"
}
```

### Load Balancer Configuration

Configure your load balancer to check:

```
GET /api/health
Expected: HTTP 200
Interval: 30 seconds
Timeout: 10 seconds
Unhealthy threshold: 3
```

---

## Monitoring

### Recommended Monitoring Setup

1. **Application Monitoring**
   - Use health check endpoints for uptime monitoring
   - Monitor response times and error rates
   - Set up alerts for HTTP 5xx errors

2. **Database Monitoring**
   - Monitor connection pool usage
   - Track query performance
   - Set up alerts for slow queries

3. **Storage Monitoring**
   - Monitor S3 bucket usage
   - Track upload/download success rates
   - Set up alerts for storage quota

### Logging

The application logs to stdout in JSON format. Configure your logging infrastructure to collect and parse these logs:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "context": "AuthService",
  "message": "User logged in",
  "userId": "uuid",
  "tenantId": "uuid"
}
```

---

## Troubleshooting

### Common Issues

**Database Connection Failed**

```bash
# Verify database connectivity
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"
```

**Storage Connection Failed**

```bash
# Verify S3 credentials
aws s3 ls s3://$S3_BUCKET_PREFIX
```

**Application Won't Start**

```bash
# Check environment variables
node -e "console.log(process.env)"

# Check logs
docker logs complytude-app
```

---

## Related Documentation

- [Main README](../README.md) - Project overview
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development setup
- [scripts/README.md](../scripts/README.md) - Database migrations

---

[Back to Documentation Index](README.md)

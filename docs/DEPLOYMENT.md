# Deployment Guide

This guide covers deploying Complytude to production environments.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Docker Deployment](#docker-deployment)
- [Production Environment](#production-environment)
- [Environment Variables](#environment-variables)
- [Health Checks](#health-checks)
- [Monitoring](#monitoring)

---

## Architecture Overview

Complytude is a **NestJS monorepo** with multiple applications and shared libraries:

### Applications

| Application          | Path                    | Purpose                                 | Port |
| -------------------- | ----------------------- | --------------------------------------- | ---- |
| **API**              | `apps/api`              | Main REST API with Swagger docs         | 3000 |
| **Worker AI**        | `apps/worker-ai`        | AI processing worker (BullMQ consumer)  | N/A  |
| **Worker Ingestion** | `apps/worker-ingestion` | Data ingestion worker (BullMQ consumer) | N/A  |

### Shared Libraries

| Library       | Path             | Purpose                                         |
| ------------- | ---------------- | ----------------------------------------------- |
| **Database**  | `libs/database`  | PostgreSQL connection, service, base repository |
| **Embedding** | `libs/embedding` | OpenAI embedding + text chunking services       |
| **Queue**     | `libs/queue`     | BullMQ queue definitions and producers          |
| **Redis**     | `libs/redis`     | Redis connection and configuration              |

### Infrastructure Services

| Service           | Purpose                           | Port(s)    |
| ----------------- | --------------------------------- | ---------- |
| **PostgreSQL 16** | Database with pgvector extension  | 5432       |
| **Redis 7**       | Message queue for BullMQ          | 6379       |
| **pgAdmin**       | Database management UI (optional) | 5050       |

---

## Docker Deployment

Complytude supports two Docker deployment approaches to fit different workflows and environments.

### Overview: Two Deployment Approaches

| Aspect                  | Hybrid Mode               | Fully Dockerized                        |
| ----------------------- | ------------------------- | --------------------------------------- |
| **NestJS Applications** | 💻 Local (Node.js)        | 🐳 Docker Container                     |
| **PostgreSQL**          | 🐳 Docker Container       | 🐳 Docker Container                     |
| **Redis**               | 🐳 Docker Container       | 🐳 Docker Container                     |
| **Hot Reload**          | ✅ Native & Fast          | ⚠️ Via Volume Mounts                    |
| **Debugging**           | ✅ Direct IDE Integration | ⚠️ Remote Debugging                     |
| **Production-like**     | ⚠️ Partial                | ✅ Identical to Production              |
| **Startup Time**        | ⚡ Fast                   | 🐌 Slower (image build)                 |
| **Best For**            | Active Development        | Staging Deployments, CI/CD              |
| **Command**             | `pnpm dev`                | `pnpm docker:dev` or `pnpm docker:prod` |

### Approach 1: Hybrid Mode (Recommended for Development)

**What it is:** NestJS applications run locally with hot-reload, while infrastructure services (PostgreSQL, Redis) run in Docker.

**Advantages:**

- ✅ Fast hot-reload for rapid development
- ✅ Easy debugging with IDE breakpoints
- ✅ Native Node.js performance
- ✅ Quick startup time
- ✅ Run individual apps or all apps together

**Quick Start:**

```bash
# Start API only (most common for development)
pnpm dev

# Or start all applications together (API + Workers)
pnpm dev:all
```

**What happens under the hood:**

```bash
pnpm dev
  → scripts/start-dev.sh
    → Checks if Docker services are running
    → Starts PostgreSQL, Redis if needed (pnpm docker:start)
    → Runs pnpm start:api (API with hot-reload)

pnpm dev:all
  → Runs all 3 apps concurrently:
    - API (port 3000)
    - Worker AI (background processor)
    - Worker Ingestion (background processor)
```

**Environment Configuration:**

In your `apps/api/.env` file, use `localhost` for service connections:

```bash
DB_HOST=localhost          # Connect to Postgres in Docker
DB_PORT=5432
REDIS_HOST=localhost       # Connect to Redis in Docker
REDIS_PORT=6379
S3_ENDPOINT=                      # Leave empty for AWS S3
```

**Available Services:**

- 🚀 API: http://localhost:3000/api
- 📚 Swagger: http://localhost:3000/docs
- 🗄️ PostgreSQL: `localhost:5432`
- 🔴 Redis: `localhost:6379`
**Running Individual Applications:**

```bash
# API only (with hot-reload)
pnpm start:api

# Worker AI only
pnpm start:worker-ai

# Worker Ingestion only
pnpm start:worker-ingestion

# All apps with debug mode
pnpm start:api:debug
pnpm start:worker-ai:debug
pnpm start:worker-ingestion:debug
```

**Manual Control (Optional):**

If you prefer manual control over services:

```bash
# Start infrastructure services only
pnpm docker:start

# Start services with pgAdmin
pnpm docker:services:tools

# Start applications manually
pnpm start:api
pnpm start:worker-ai
pnpm start:worker-ingestion

# Stop services
pnpm docker:stop
```

---

### Approach 2: Fully Dockerized (Production-like)

**What it is:** Everything runs in Docker containers, including all NestJS applications (API + Workers).

**Advantages:**

- ✅ Production-like environment
- ✅ Consistent across team members
- ✅ Perfect for CI/CD pipelines
- ✅ Easy deployment validation
- ✅ Isolated environment

**When to use:**

- Validating Docker deployment before production
- CI/CD pipelines
- Onboarding new developers (no local Node.js setup needed)
- Debugging Docker-specific issues
- Testing the complete system with all workers

**Development Mode (with hot-reload):**

```bash
# Build development image (includes dev dependencies)
pnpm docker:dev:build

# Start all services in development mode
pnpm docker:dev

# Or run in detached mode
pnpm docker:dev:up

# View logs
pnpm docker:dev:logs

# Restart API after changes
pnpm docker:dev:restart

# Stop everything
pnpm docker:dev:down
```

**Production Mode (optimized):**

```bash
# Build production image (minimal, ~150MB)
pnpm docker:prod:build

# Start all services in production mode
pnpm docker:prod

# Or run in detached mode
pnpm docker:prod:up

# View logs
pnpm docker:prod:logs

# Restart API
pnpm docker:prod:restart

# Stop everything
pnpm docker:prod:down
```

**Dockerfile Multi-Stage Build:**

The `apps/api/Dockerfile` uses multi-stage builds for optimal image size:

- **Stage 1 (dependencies):** Install all dependencies (cached layer)
- **Stage 2 (build):** Build TypeScript for all apps + prune dev dependencies
- **Stage 3 (development):** Development runtime with hot-reload support
- **Stage 4 (production):** Production runtime (minimal, ~150MB, non-root user)

**Environment Configuration:**

Docker Compose automatically overrides environment variables for container networking:

```bash
# In apps/api/.env (works for both hybrid and Docker modes)
DB_HOST=localhost          # Overridden to 'postgres' in Docker
REDIS_HOST=localhost       # Overridden to 'redis' in Docker
S3_ENDPOINT=                      # Leave empty for AWS S3
```

You don't need to change your `.env` file between modes!

**Available Services:**

- 🚀 API: http://localhost:3000/api
- 📚 Swagger: http://localhost:3000/docs
- 🗄️ PostgreSQL: `localhost:5432` (from host)
- 🔴 Redis: `localhost:6379` (from host)
**Verify Everything is Running:**

```bash
# Check container status
docker ps

# View logs from API
pnpm docker:dev:logs  # or pnpm docker:prod:logs

# Check health
curl http://localhost:3000/api/health
```

**Stopping Services:**

```bash
# Development mode
pnpm docker:dev:down

# Production mode
pnpm docker:prod:down

# Stop all services and remove data (fresh start)
pnpm docker:reset
```

---

### Docker Compose Services Reference

| Service      | Container Name        | Default Port | Configuration  | Description                   |
| ------------ | --------------------- | ------------ | -------------- | ----------------------------- |
| `postgres`   | complytude-postgres   | 5432         | Base           | PostgreSQL 16 with pgvector   |
| `redis`      | complytude-redis      | 6379         | Base           | Redis 7 for BullMQ            |
| `pgadmin`    | complytude-pgadmin    | 5050         | Profile: tools | Database management UI        |
| `api`        | complytude-api-dev    | 3000         | Dev compose    | NestJS API (development mode) |
| `api`        | complytude-api-prod   | 3000         | Prod compose   | NestJS API (production mode)  |

**Docker Compose Files:**

- **docker-compose.yml** - Base configuration (PostgreSQL, Redis, pgAdmin)
- **docker-compose.dev.yml** - Development overlay (API with hot-reload)
- **docker-compose.prod.yml** - Production overlay (API optimized build)

**Starting specific services:**

```bash
# Infrastructure services only (default - hybrid mode)
docker-compose up -d

# Infrastructure + pgAdmin
pnpm docker:services:tools

# Development mode (infrastructure + API with hot-reload)
pnpm docker:dev

# Production mode (infrastructure + API optimized)
pnpm docker:prod
```

---

### Building the Docker Image

The project includes a production-optimized Dockerfile at `apps/api/Dockerfile` with multi-stage builds.

**Build Commands:**

```bash
# Production build (default, minimal image)
docker build -f apps/api/Dockerfile -t complytude-api:latest --target production .

# Development build (includes dev dependencies)
docker build -f apps/api/Dockerfile -t complytude-api:dev --target development .

# Using pnpm scripts (recommended)
pnpm docker:prod:build  # Production
pnpm docker:dev:build   # Development
```

**Image Optimization Features:**

- ✅ Multi-stage build (smaller final image)
- ✅ Monorepo-aware (builds all apps + shared libs)
- ✅ Layer caching for faster rebuilds
- ✅ Non-root user for security (production only)
- ✅ Health checks built-in
- ✅ Signal handling with dumb-init (production only)
- ✅ PNPM workspace support

**Build Stages:**

1. **dependencies** - Install all dependencies (cached)
2. **build** - Compile TypeScript for all apps, prune dev dependencies
3. **development** - Development runtime with hot-reload
4. **production** - Minimal production runtime

**Image Sizes:**

- Production image: ~150MB (Node 22.16.0 Alpine + compiled code)
- Development image: ~300MB (includes TypeScript, dev tools)

**What Gets Built:**

- ✅ API application (`apps/api`)
- ✅ Worker AI application (`apps/worker-ai`)
- ✅ Worker Ingestion application (`apps/worker-ingestion`)
- ✅ Redis library (`libs/redis`)
- ✅ Queue library (`libs/queue`)

---

### Environment Variables for Docker

**Key Differences Between Modes:**

| Variable      | Hybrid Mode             | Fully Dockerized    |
| ------------- | ----------------------- | ------------------- |
| `DB_HOST`     | `localhost`             | `postgres`          |
| `REDIS_HOST`  | `localhost`             | `redis`             |
| `S3_ENDPOINT` | (empty for AWS S3)      | (empty for AWS S3)  |

**Complete Environment Variables for Hybrid Mode:**

Create `apps/api/.env` file:

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

# Redis (use localhost for hybrid mode)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Authentication
JWT_ACCESS_SECRET=your-super-secret-jwt-access-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-jwt-refresh-key-change-this-in-production
JWT_IDENTITY_SECRET=your-super-secret-jwt-identity-key-change-this-in-production
JWT_IDENTITY_REFRESH_SECRET=your-super-secret-jwt-identity-refresh-key-change-this-in-production
JWT_ACCESS_EXPIRES_IN=30m
JWT_IDENTITY_EXPIRES_IN=15m
# Redis-backed sessions — also sets identity + tenant refresh JWT expiry (jwt.refreshExpiresIn)
SESSION_MAX_TTL=14d
SESSION_IDLE_TIMEOUT=72h
SESSION_MAX_PER_USER=5
SESSION_ACTIVITY_THROTTLE_SECONDS=120

# AWS S3 Storage
S3_ENDPOINT=
S3_REGION=eu-central-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_FORCE_PATH_STYLE=false
COMPLYTUDE_FILES_BUCKET_NAME=complytude-files
TEMPLATES_BUCKET_NAME=complytude-templates
QUARANTINE_BUCKET_NAME=complytude-quarantine
MAX_FILE_SIZE=10485760
SIGNED_URL_EXPIRES_IN=900

# Redis (Docker Service)
REDIS_PORT=6379

# pgAdmin (Optional)
PGADMIN_EMAIL=admin@complytude.com
PGADMIN_PASSWORD=admin
PGADMIN_PORT=5050
```

**Why the difference?**

- In hybrid mode, NestJS apps run on your host machine and connect to Docker services via `localhost`
- In fully dockerized mode, NestJS apps run in containers and use Docker networking (service names)

**Automatic Configuration:**

Docker Compose automatically overrides environment variables for container networking. When you run `pnpm docker:dev` or `pnpm docker:prod`, it automatically overrides:

- `DB_HOST` → `postgres`
- `REDIS_HOST` → `redis`

**Production Environment Variables:**

See [Environment Variables](#environment-variables) section below for production configuration.

---

### Troubleshooting Docker Issues

**Services not starting?**

```bash
# Check Docker is running
docker info

# View logs for all services
pnpm docker:logs

# View specific service logs
pnpm docker:logs:postgres
# Restart services
pnpm docker:stop
pnpm docker:start
```

**API container failing in Docker mode?**

```bash
# Development mode
pnpm docker:dev:logs

# Production mode
pnpm docker:prod:logs

# Common issues:
# 1. Database not ready - wait a few seconds
# 2. Redis not ready - wait for health check
# 3. Environment variables incorrect - check apps/api/.env
# 4. Port conflict - change PORT in .env

# Rebuild if code changes aren't reflected
pnpm docker:dev:build    # or pnpm docker:prod:build
pnpm docker:dev:up       # or pnpm docker:prod:up
```

**Workers not processing jobs?**

```bash
# Check Redis connection
docker exec -it complytude-redis redis-cli ping

# Check if workers are running (in hybrid mode)
pnpm start:worker-ai
pnpm start:worker-ingestion

# In Docker mode, workers run inside the API container
# Check logs for worker activity
pnpm docker:dev:logs | grep -i worker
```

**Port conflicts?**

```bash
# Change ports in apps/api/.env
PORT=3001
DB_PORT=5433
REDIS_PORT=6380
# Restart services
pnpm docker:stop
pnpm docker:start
```

**Need a completely fresh start?**

```bash
# Nuclear option: delete everything and start fresh
pnpm docker:reset
pnpm db:migrate

# For Docker mode
pnpm docker:dev:build    # or pnpm docker:prod:build
pnpm docker:dev:up       # or pnpm docker:prod:up
```

**Volume permission issues (Linux)?**

```bash
# If you see permission errors with mounted volumes
sudo chown -R $USER:$USER ./apps ./libs ./node_modules
```

---

### CI/CD with Docker

**Example GitHub Actions workflow:**

```yaml
name: CI/CD

on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Build Docker image
        run: docker build -f apps/api/Dockerfile -t complytude-api:ci --target production .

      - name: Start infrastructure services
        run: docker-compose up -d

      - name: Start API in production mode
        run: docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

      - name: Wait for health check
        run: |
          timeout 60 bash -c 'until curl -f http://localhost:3000/api/health; do sleep 2; done'

      - name: Run integration tests (if available)
        run: |
          # Add your test commands here
          echo "Tests would run here"

      - name: Cleanup
        run: docker-compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

**Multi-App Deployment:**

For production deployments with workers:

```yaml
deploy:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3

    - name: Build all applications
      run: |
        docker build -f apps/api/Dockerfile -t complytude-api:${{ github.sha }} --target production .
        # Tag for latest
        docker tag complytude-api:${{ github.sha }} complytude-api:latest

    - name: Push to registry
      run: |
        echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
        docker push complytude-api:${{ github.sha }}
        docker push complytude-api:latest

    - name: Deploy to production
      run: |
        # Deploy API
        # Deploy Worker AI
        # Deploy Worker Ingestion
        # Your deployment commands here
```

---

## Production Environment

### Step-by-Step Setup

1. **Create production environment file**:

   ```bash
   cp apps/api/.env.example apps/api/.env.production
   ```

2. **Update environment variables** (see [Environment Variables](#environment-variables))

3. **Build all applications**:

   ```bash
   pnpm build:all
   ```

4. **Run database migrations**:

   ```bash
   NODE_ENV=production pnpm db:migrate
   ```

5. **Start all applications**:

   ```bash
   # Start all apps in production mode
   NODE_ENV=production pnpm start:all:prod

   # Or start individually
   NODE_ENV=production pnpm start:api:prod
   NODE_ENV=production pnpm start:worker-ai:prod
   NODE_ENV=production pnpm start:worker-ingestion:prod
   ```

### Production Architecture

**Recommended Deployment:**

```
┌─────────────────────────────────────────────────────┐
│                   Load Balancer                     │
│                    (HTTPS/SSL)                      │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│   API Instance │   │  API Instance   │
│   (Port 3000)  │   │  (Port 3000)    │
└───────┬────────┘   └────────┬────────┘
        │                     │
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┬──────────────┐
        │                     │              │
┌───────▼────────┐   ┌────────▼────────┐   ┌▼──────────────┐
│  Worker AI     │   │ Worker Ingestion│   │   Redis       │
│  (Background)  │   │  (Background)   │   │ (Message Queue)│
└───────┬────────┘   └────────┬────────┘   └───────────────┘
        │                     │
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┬──────────────┐
        │                     │              │
┌───────▼────────┐   ┌────────▼────────┐   ┌▼──────────────┐
│   PostgreSQL   │   │      S3         │   │   Monitoring  │
│   (Managed)    │   │   (Storage)     │   │   (Logs/APM)  │
└────────────────┘   └─────────────────┘   └───────────────┘
```

### Production Considerations

**Infrastructure:**

- ✅ Use managed PostgreSQL service (AWS RDS, Azure Database, etc.)
- ✅ Use managed Redis service (AWS ElastiCache, Azure Cache, etc.)
- ✅ Use AWS S3 for storage
- ✅ Deploy API behind a load balancer for high availability
- ✅ Run workers as separate services/containers
- ✅ Enable HTTPS via reverse proxy (nginx, AWS ALB, etc.)

**Security:**

- ✅ Set strong, unique JWT secrets (use `openssl rand -base64 64`)
- ✅ Configure proper CORS origins (no wildcards)
- ✅ Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- ✅ Enable database SSL connections
- ✅ Use non-root user in Docker containers (already configured)
- ✅ Implement rate limiting and DDoS protection

**Performance:**

- ✅ Configure database connection pooling (DB_MAX_CONNECTIONS)
- ✅ Scale API horizontally (multiple instances)
- ✅ Scale workers based on queue depth
- ✅ Use CDN for static assets
- ✅ Enable response compression
- ✅ Implement caching strategies

**Monitoring & Logging:**

- ✅ Set up application monitoring (health checks, metrics)
- ✅ Configure centralized logging (CloudWatch, ELK, Datadog)
- ✅ Monitor queue depth and worker performance
- ✅ Set up alerts for errors and performance issues
- ✅ Track database performance and slow queries

---

## Environment Variables

### Required Production Variables

Create `apps/api/.env.production`:

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

# Redis - Use managed Redis service
REDIS_HOST=your-redis-host.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=<strong-password>  # If using managed Redis with auth
REDIS_TLS=true  # Enable for managed Redis with TLS

# JWT - Use strong random secrets
JWT_ACCESS_SECRET=<generate-with-openssl-rand-base64-64>
JWT_REFRESH_SECRET=<generate-with-openssl-rand-base64-64>
JWT_IDENTITY_SECRET=<generate-with-openssl-rand-base64-64>
JWT_IDENTITY_REFRESH_SECRET=<generate-with-openssl-rand-base64-64>
JWT_ACCESS_EXPIRES_IN=30m
JWT_IDENTITY_EXPIRES_IN=15m
SESSION_MAX_TTL=14d
SESSION_IDLE_TIMEOUT=72h
SESSION_MAX_PER_USER=5
SESSION_ACTIVITY_THROTTLE_SECONDS=120

# S3 Storage - Use AWS S3 in production
S3_REGION=eu-central-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_FORCE_PATH_STYLE=false
COMPLYTUDE_FILES_BUCKET_NAME=complytude-production-clean
TEMPLATES_BUCKET_NAME=complytude-production-clean
QUARANTINE_BUCKET_NAME=complytude-production-quarantine
# Note: Leave S3_ENDPOINT empty for AWS S3; credentials come from IAM role

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

# Generate database password
openssl rand -base64 32

# Generate Redis password (if needed)
openssl rand -base64 32
```

### Environment Variables by Application

**API Application** (`apps/api/.env`):

- All variables listed above

**Worker AI** (uses same `.env` as API):

- Shares Redis configuration
- Shares database configuration
- No HTTP server, so PORT not used

**Worker Ingestion** (uses same `.env` as API):

- Shares Redis configuration
- Shares database configuration
- No HTTP server, so PORT not used

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
   - Track API throughput and latency

2. **Database Monitoring**
   - Monitor connection pool usage
   - Track query performance
   - Set up alerts for slow queries
   - Monitor replication lag (if using replicas)

3. **Redis Monitoring**
   - Monitor memory usage
   - Track queue depth and processing rates
   - Set up alerts for queue backlog
   - Monitor connection count

4. **Worker Monitoring**
   - Track job processing rates
   - Monitor job failure rates
   - Set up alerts for stuck jobs
   - Monitor worker resource usage (CPU, memory)

5. **Storage Monitoring**
   - Monitor S3 bucket usage
   - Track upload/download success rates
   - Set up alerts for storage quota
   - Monitor file quarantine/clean ratios

### Queue Monitoring

**BullMQ Dashboard:**

The project includes Bull Board for queue monitoring (development only):

- Access at: http://localhost:3000/admin/queues (when running in dev mode)
- View queue status, job counts, and processing rates
- Retry failed jobs
- View job details and logs

**Production Queue Monitoring:**

For production, integrate with:

- Redis monitoring tools (RedisInsight, Redis Commander)
- Application Performance Monitoring (APM) tools
- Custom metrics exported to Prometheus/Grafana

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

**Worker Logs:**

Workers also log to stdout with context:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "context": "WorkerAI",
  "message": "Processing AI job",
  "jobId": "uuid",
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

# Check if database is accepting connections
pg_isready -h $DB_HOST -p $DB_PORT
```

**Redis Connection Failed**

```bash
# Verify Redis connectivity
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Check Redis info
redis-cli -h $REDIS_HOST -p $REDIS_PORT info
```

**Storage Connection Failed**

```bash
# Verify S3 credentials
aws s3 ls s3://$COMPLYTUDE_FILES_BUCKET_NAME

# Test S3 access
aws s3 cp test.txt s3://$COMPLYTUDE_FILES_BUCKET_NAME/test.txt
```

**Application Won't Start**

```bash
# Check environment variables
node -e "console.log(process.env)"

# Check logs (hybrid mode)
pnpm start:api

# Check logs (Docker mode)
pnpm docker:dev:logs  # or pnpm docker:prod:logs
```

**Workers Not Processing Jobs**

```bash
# Check Redis connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Check queue depth
redis-cli -h $REDIS_HOST -p $REDIS_PORT llen bull:ai-processing:wait

# Verify workers are running
ps aux | grep worker

# Check worker logs
pnpm start:worker-ai
pnpm start:worker-ingestion
```

**Jobs Stuck in Queue**

```bash
# Check failed jobs
redis-cli -h $REDIS_HOST -p $REDIS_PORT llen bull:ai-processing:failed

# View Bull Board (development)
# Navigate to http://localhost:3000/admin/queues

# Manually retry failed jobs via Bull Board
# Or programmatically via BullMQ API
```

---

## Scaling Strategies

### Horizontal Scaling

**API Scaling:**

- Deploy multiple API instances behind a load balancer
- Use sticky sessions if needed (or use Redis for session storage)
- Scale based on CPU/memory usage or request rate

**Worker Scaling:**

- Deploy multiple worker instances for each worker type
- Workers automatically compete for jobs from Redis queues
- Scale based on queue depth and processing time

**Example Kubernetes Deployment:**

```yaml
# API Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: complytude-api
spec:
  replicas: 3 # Scale as needed
  selector:
    matchLabels:
      app: complytude-api
  template:
    metadata:
      labels:
        app: complytude-api
    spec:
      containers:
        - name: api
          image: complytude-api:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
          # ... other env vars from ConfigMap/Secret

---
# Worker AI Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: complytude-worker-ai
spec:
  replicas: 2 # Scale based on queue depth
  selector:
    matchLabels:
      app: complytude-worker-ai
  template:
    metadata:
      labels:
        app: complytude-worker-ai
    spec:
      containers:
        - name: worker-ai
          image: complytude-api:latest
          command: ['node', 'dist/apps/worker-ai/main']
          env:
            - name: NODE_ENV
              value: 'production'
          # ... other env vars
```

### Vertical Scaling

**Resource Recommendations:**

| Service          | CPU       | Memory | Notes                                   |
| ---------------- | --------- | ------ | --------------------------------------- |
| API              | 1-2 cores | 1-2 GB | Scale horizontally for more throughput  |
| Worker AI        | 2-4 cores | 2-4 GB | CPU-intensive AI processing             |
| Worker Ingestion | 1-2 cores | 1-2 GB | I/O bound, scale horizontally           |
| PostgreSQL       | 4+ cores  | 8+ GB  | Use managed service recommendations     |
| Redis            | 2 cores   | 4+ GB  | Memory-bound, scale based on queue size |

---

## Related Documentation

- [Main README](../README.md) - Project overview and quick start
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and design
- [DATABASE.md](DATABASE.md) - Database schema and RLS policies
- [API_CONTRACTS.md](apps/api/docs/API_CONTRACTS.md) - API endpoint specifications
- [DEVELOPMENT.md](apps/api/docs/DEVELOPMENT.md) - Development setup and guidelines
- [scripts/README.md](../scripts/README.md) - Database migrations and seeds

---

[Back to Documentation Index](README.md)

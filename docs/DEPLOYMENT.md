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

### Building the Image

```bash
docker build -t complytude:latest .
```

### Running with Docker Compose

For production deployment with all services:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Docker Compose Services

| Service    | Description                         | Default Port |
| ---------- | ----------------------------------- | ------------ |
| `app`      | Complytude API                      | 3000         |
| `postgres` | PostgreSQL database                 | 5432         |
| `minio`    | S3-compatible storage (dev/staging) | 9000         |
| `pgadmin`  | Database management UI (optional)   | 5050         |

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
- ✅ Set strong, unique `JWT_SECRET`
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
DB_USER=complytude_prod
DB_PASSWORD=<strong-password>
DB_NAME=complytude_production

# JWT - Use a strong random secret
JWT_SECRET=<generate-with-openssl-rand-base64-64>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# S3 Storage - Use AWS S3 in production
STORAGE_TYPE=s3
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<your-aws-access-key>
S3_SECRET_ACCESS_KEY=<your-aws-secret-key>
S3_BUCKET_NAME=complytude-production
S3_FORCE_PATH_STYLE=false
```

### Generating Secrets

```bash
# Generate JWT secret
openssl rand -base64 64

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
aws s3 ls s3://$S3_BUCKET_NAME
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

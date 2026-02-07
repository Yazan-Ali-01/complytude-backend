# Logging Implementation Testing Guide

This guide provides step-by-step instructions to test and verify the Pino logging implementation across all Complytude services.

## Prerequisites

Before testing, ensure:

1. All dependencies are installed
2. Environment variables are configured
3. PostgreSQL is running (for API testing)

## Step 1: Install Dependencies

```bash
# From project root
pnpm install

# This will install:
# - nestjs-pino@^4.3.0
# - pino@^9.6.0
# - pino-http@^10.3.0
# - pino-pretty@^13.0.0 (dev dependency)
```

## Step 2: Verify Configuration Files

### Check Environment Files

```bash
# API Gateway
cat apps/api/.env | grep LOG

# Worker AI
cat apps/worker-ai/.env | grep LOG

# Worker Ingestion
cat apps/worker-ingestion/.env | grep LOG
```

**Expected Output:**
```
SERVICE_NAME=gateway (or worker-ai, worker-ingestion)
LOG_LEVEL=debug
LOG_PRETTY=true
LOG_AUTO_LOGGING=true
```

### Verify Logger Module Export

```bash
# Check shared library exports
cat libs/shared/src/index.ts
```

**Expected:** Should include logger exports

## Step 3: Test API Gateway Logging

### Start the API Gateway

```bash
# Terminal 1
pnpm start:api
```

### Expected Output (Pretty-Printed Development Mode)

```
[10:30:00.123] INFO (Bootstrap): 🚀 Application is running on: http://localhost:3000/api
    trace_id: "system-boot"
    service_name: "gateway"
    
[10:30:00.124] INFO (Bootstrap): 📚 Swagger documentation: http://localhost:3000/docs
    trace_id: "system-boot"
    service_name: "gateway"
    
[10:30:00.125] INFO (Bootstrap): 🌍 Environment: development
    trace_id: "system-boot"
    service_name: "gateway"
```

### Test HTTP Request Logging

```bash
# Terminal 2 - Send test request
curl http://localhost:3000/health
```

**Expected Log Output:**
```
[10:30:05.456] INFO: GET /health completed
    trace_id: "abc-123-def-456"
    service_name: "gateway"
    req: {
      id: "abc-123-def-456",
      method: "GET",
      url: "/health",
      remoteAddress: "127.0.0.1"
    }
    res: {
      statusCode: 200,
      responseTime: 5
    }
```

### Test Authenticated Request (with Tenant Context)

```bash
# 1. Register and login to get tokens
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!","firstName":"Test","lastName":"User"}'

# 2. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!"}'

# 3. Make authenticated request (with cookies from login)
curl http://localhost:3000/api/tenants -c cookies.txt -b cookies.txt
```

**Expected Log Output (with tenant_id):**
```
[10:30:10.789] INFO: GET /api/tenants completed
    trace_id: "xyz-789-uvw-012"
    service_name: "gateway"
    tenant_id: "tenant-uuid-here"
    user_id: "user-uuid-here"
    req: {
      id: "xyz-789-uvw-012",
      method: "GET",
      url: "/api/tenants"
    }
    res: {
      statusCode: 200,
      responseTime: 25
    }
```

## Step 4: Test Worker AI Logging

```bash
# Terminal 3
pnpm start:worker-ai
```

**Expected Output:**
```
[10:31:00.123] INFO (WorkerAI): 🤖 Worker AI is running on: http://localhost:3001
    trace_id: "system-boot"
    service_name: "worker-ai"
    
[10:31:00.124] INFO (WorkerAI): 🌍 Environment: development
    trace_id: "system-boot"
    service_name: "worker-ai"
```

## Step 5: Test Worker Ingestion Logging

```bash
# Terminal 4
pnpm start:worker-ingestion
```

**Expected Output:**
```
[10:32:00.123] INFO (WorkerIngestion): 📥 Worker Ingestion is running on: http://localhost:3002
    trace_id: "system-boot"
    service_name: "worker-ingestion"
    
[10:32:00.124] INFO (WorkerIngestion): 🌍 Environment: development
    trace_id: "system-boot"
    service_name: "worker-ingestion"
```

## Step 6: Test Production Mode (NDJSON)

### Update Environment

```bash
# Temporarily change LOG_PRETTY to false
export LOG_PRETTY=false
export LOG_LEVEL=info

# Restart API
pnpm start:api
```

**Expected Output (NDJSON - One line per log):**
```json
{"level":"info","time":"2026-02-08T10:30:00.123Z","msg":"🚀 Application is running on: http://localhost:3000/api","trace_id":"system-boot","service_name":"gateway","context":"Bootstrap"}
{"level":"info","time":"2026-02-08T10:30:00.124Z","msg":"📚 Swagger documentation: http://localhost:3000/docs","trace_id":"system-boot","service_name":"gateway","context":"Bootstrap"}
```

### Verify JSON Parsing

```bash
# Pipe logs to jq for validation
pnpm start:api 2>&1 | jq .
```

**Expected:** Valid JSON objects with no parsing errors

## Step 7: Test Log Levels

### Debug Level

```bash
# In a service file, add debug logs
# Example: apps/api/src/modules/health/health.service.ts

this.logger.debug('Health check requested', { timestamp: new Date() });
```

```bash
# Set LOG_LEVEL=debug and restart
export LOG_LEVEL=debug
pnpm start:api

# Send request
curl http://localhost:3000/health
```

**Expected:** Debug logs are visible

### Info Level (Hide Debug)

```bash
# Set LOG_LEVEL=info and restart
export LOG_LEVEL=info
pnpm start:api

# Send request
curl http://localhost:3000/health
```

**Expected:** Debug logs are NOT visible, only info and above

### Error Level

```bash
# Trigger an error (e.g., invalid endpoint)
curl http://localhost:3000/api/invalid-endpoint
```

**Expected Error Log:**
```
[10:35:00.456] ERROR: GET /api/invalid-endpoint failed: Cannot GET /api/invalid-endpoint
    trace_id: "error-trace-id"
    service_name: "gateway"
    err: {
      type: "NotFoundException",
      message: "Cannot GET /api/invalid-endpoint",
      stack: "Error: Cannot GET /api/invalid-endpoint\n    at ..."
    }
```

## Step 8: Test Request Correlation

### Same Trace ID Across Services

```bash
# Send request with custom x-request-id
curl -H "x-request-id: test-correlation-123" \
  http://localhost:3000/api/health
```

**Expected:** Logs show `trace_id: "test-correlation-123"`

### Multi-Service Correlation

```bash
# 1. Send request to API that triggers worker
# (This will be tested when workers are fully integrated)

# 2. Grep logs for same trace_id
grep "test-correlation-123" logs/*.log
```

**Expected:** Multiple services show same `trace_id`

## Step 9: Test Health Check Filtering

Health checks should NOT be logged (to reduce noise):

```bash
# Send multiple health checks
for i in {1..10}; do
  curl http://localhost:3000/health
done
```

**Expected:** Only 1-2 logs or none (health checks filtered by autoLogging.ignore)

## Step 10: Verify Database Service Logging

The DatabaseService should continue to work with Pino:

```bash
# Start API and make a database query
pnpm start:api

# In another terminal
curl http://localhost:3000/api/health/database
```

**Expected Logs:**
```
[10:40:00.123] DEBUG (DatabaseService): Executed query in 5ms: SELECT NOW() as time
    trace_id: "db-trace-id"
    service_name: "gateway"
```

## Validation Checklist

Use this checklist to verify the implementation:

### ✅ Configuration
- [ ] `pino`, `nestjs-pino`, `pino-http` installed in package.json
- [ ] `pino-pretty` installed as dev dependency
- [ ] LoggerModule exported from `@complytude/shared`
- [ ] Logger config files created for all apps
- [ ] Environment variables added to env.schema.ts
- [ ] .env files updated with logging config

### ✅ Integration
- [ ] LoggerModule imported in AppModule (API)
- [ ] LoggerModule imported in WorkerAiModule
- [ ] LoggerModule imported in WorkerIngestionModule
- [ ] `app.useLogger(app.get(PinoLogger))` in all main.ts files
- [ ] `bufferLogs: true` in NestFactory.create()

### ✅ Functionality
- [ ] Logs appear on application startup
- [ ] HTTP requests are auto-logged
- [ ] Health checks are filtered out
- [ ] `trace_id` present in all logs
- [ ] `service_name` present in all logs
- [ ] `tenant_id` appears in authenticated requests
- [ ] Debug logs visible when LOG_LEVEL=debug
- [ ] Debug logs hidden when LOG_LEVEL=info
- [ ] Errors logged with stack traces
- [ ] Pretty-print works in development
- [ ] NDJSON works in production mode

### ✅ Performance
- [ ] No noticeable performance degradation
- [ ] Logs appear without delay in development
- [ ] Application starts successfully
- [ ] No memory leaks after extended use

## Troubleshooting

### Logs Not Appearing

**Problem:** No logs after starting application

**Solution:**
```bash
# 1. Check if LoggerModule is imported
grep -r "LoggerModule" apps/api/src/app.module.ts

# 2. Check if logger is replaced in main.ts
grep "useLogger" apps/api/src/main.ts

# 3. Verify dependencies are installed
pnpm list nestjs-pino pino pino-http
```

### Pretty Print Not Working

**Problem:** Logs are JSON instead of pretty-printed

**Solution:**
```bash
# 1. Check environment variable
echo $LOG_PRETTY

# 2. Verify pino-pretty is installed
pnpm list pino-pretty

# 3. Restart application
pnpm start:api
```

### Tenant Context Not Appearing

**Problem:** `tenant_id` not in logs

**Solution:**
```bash
# 1. Ensure user is authenticated
# Login first and get cookies

# 2. Check JWT guard is setting auth context
# Verify in auth strategy that request.auth.tenant is set

# 3. Check pino.config.ts customProps function
cat libs/shared/src/logger/pino.config.ts | grep -A 10 "customProps"
```

## Next Steps

After successful testing:

1. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat(logging): implement nestjs-pino structured logging
   
   - Add LoggerModule in libs/shared with Pino
   - Configure NDJSON output for production
   - Add trace_id for distributed tracing
   - Add tenant_id extraction from JWT
   - Auto-log HTTP requests with filtering
   - Add comprehensive documentation"
   ```

2. **Update CI/CD** (if applicable)
   - Ensure LOG_LEVEL=info in production environment
   - Verify LOG_PRETTY=false in production

3. **Setup Log Aggregation**
   - Follow [Infrastructure Logging Guide](./README.md)
   - Configure Datadog/ELK/CloudWatch

4. **Monitor Production**
   - Watch for log volume
   - Set up alerts for errors
   - Create dashboards for key metrics

## Success Criteria

The implementation is successful when:

✅ All services log in structured JSON format  
✅ trace_id correlates requests across services  
✅ tenant_id appears in authenticated requests  
✅ service_name identifies log source  
✅ Pretty-print works in development  
✅ NDJSON works in production  
✅ Performance is not impacted  
✅ Health checks are filtered  
✅ Error logs include stack traces  
✅ Documentation is complete and accurate  

---

**Last Updated**: February 8, 2026
**Testing Version**: 1.0.0

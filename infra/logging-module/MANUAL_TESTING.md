# Manual Testing Checklist for Logging Implementation

Follow this step-by-step checklist to verify the logging implementation works correctly.

## Prerequisites

- [ ] Docker services running (PostgreSQL, MinIO)
- [ ] Dependencies installed: `pnpm install`
- [ ] Environment variables configured in `.env` files

## Test Suite 1: Installation & Configuration

### 1.1 Verify Dependencies Installed

```bash
cd C:\Users\DELL\Desktop\wOrK

# Check if Pino dependencies are installed
pnpm list | grep -E "(pino|nestjs-pino)"
```

**Expected Output:**
```
nestjs-pino 4.3.0
pino 9.6.0
pino-http 10.3.0
pino-pretty 13.0.0
```

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 1.2 Verify Configuration Files Exist

```bash
# Check logger config files
ls -la apps/api/src/config/logger.config.ts
ls -la apps/worker-ai/src/config/logger.config.ts
ls -la apps/worker-ingestion/src/config/logger.config.ts

# Check shared logger module
ls -la libs/shared/src/logger/logger.module.ts
ls -la libs/shared/src/logger/pino.config.ts
```

**Expected:** All files exist (no "No such file" errors)

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 1.3 Verify Environment Variables

```bash
# Check API .env
cat apps/api/.env | grep -E "^(SERVICE_NAME|LOG_LEVEL|LOG_PRETTY|LOG_AUTO_LOGGING)"
```

**Expected Output:**
```
SERVICE_NAME=gateway
LOG_LEVEL=debug
LOG_PRETTY=true
LOG_AUTO_LOGGING=true
```

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

## Test Suite 2: API Gateway Logging

### 2.1 Start API Gateway

```bash
# Terminal 1
pnpm start:api
```

**Wait for startup (15-30 seconds)**

**Expected Output (Pretty-Printed):**
```
[HH:MM:SS.mmm] INFO (DatabaseService): ✅ Database connection established successfully
    trace_id: "..."
    service_name: "gateway"

[HH:MM:SS.mmm] INFO (Bootstrap): 🚀 Application is running on: http://localhost:3000/api
    trace_id: "..."
    service_name: "gateway"

[HH:MM:SS.mmm] INFO (Bootstrap): 📚 Swagger documentation: http://localhost:3000/docs
    trace_id: "..."
    service_name: "gateway"
```

**Verify:**
- [ ] Logs are pretty-printed (colorful, readable)
- [ ] `trace_id` field is present
- [ ] `service_name: "gateway"` is present
- [ ] No errors during startup

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 2.2 Test Health Check Endpoint

```bash
# Terminal 2
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-08T...",
  "uptime": 123.456
}
```

**Check Terminal 1 Logs:**

**Expected Log (Health check should be FILTERED - may not appear):**
```
[HH:MM:SS.mmm] INFO: GET /health completed
    trace_id: "abc-123-..."
    service_name: "gateway"
```

**Verify:**
- [ ] Health check works (returns 200 OK)
- [ ] Health check is NOT logged (filtered by autoLogging.ignore) OR logged only once

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 2.3 Test Database Health Check

```bash
# Terminal 2
# NOTE: Endpoint is /db not /database
curl http://localhost:3000/api/health/db
```

**Expected Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-02-08T..."
}
```

**Check Terminal 1 Logs:**

**Expected Log:**
```
[HH:MM:SS.mmm] DEBUG (DatabaseService): Executed query in 5ms: SELECT NOW() as time
    trace_id: "xyz-789-..."
    service_name: "gateway"

[HH:MM:SS.mmm] INFO: GET /api/health/database completed
    trace_id: "xyz-789-..."
    service_name: "gateway"
    req: {
      method: "GET",
      url: "/api/health/database"
    }
    res: {
      statusCode: 200,
      responseTime: 10
    }
```

**Verify:**
- [ ] Database health check works
- [ ] Request is logged with `trace_id`
- [ ] Request method and URL are included
- [ ] Response code and time are included

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 2.4 Test Request Correlation (Custom trace_id)

```bash
# Send request with custom trace_id header
curl -H "x-request-id: test-trace-12345" \
  http://localhost:3000/api/health/database
```

**Check Terminal 1 Logs:**

**Expected Log:**
```
[HH:MM:SS.mmm] INFO: GET /api/health/database completed
    trace_id: "test-trace-12345"
    service_name: "gateway"
```

**Verify:**
- [ ] Custom `trace_id: "test-trace-12345"` appears in logs

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 2.5 Test Authentication Flow with Tenant Context

```bash
# 1. Register new user
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "logging-test@example.com",
    "password": "LogTest1234!",
    "firstName": "Logging",
    "lastName": "Test",
    "tenantName": "Logging Test Tenant"
  }' \
  -c cookies.txt

# 2. Login to get tenant token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "logging-test@example.com",
    "password": "LogTest1234!"
  }' \
  -b cookies.txt \
  -c cookies.txt

# 3. Make authenticated request
curl http://localhost:3000/api/tenants \
  -b cookies.txt
```

**Check Terminal 1 Logs for Step 3:**

**Expected Log (with tenant_id):**
```
[HH:MM:SS.mmm] INFO: GET /api/tenants completed
    trace_id: "..."
    service_name: "gateway"
    tenant_id: "..."
    user_id: "..."
    req: {
      method: "GET",
      url: "/api/tenants"
    }
    res: {
      statusCode: 200,
      responseTime: 25
    }
```

**Verify:**
- [ ] Signup and login work
- [ ] Authenticated request includes `tenant_id`
- [ ] Authenticated request includes `user_id`

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 2.6 Test Error Logging

```bash
# Trigger 404 error
curl http://localhost:3000/api/invalid-endpoint
```

**Check Terminal 1 Logs:**

**Expected Log:**
```
[HH:MM:SS.mmm] ERROR: GET /api/invalid-endpoint failed
    trace_id: "..."
    service_name: "gateway"
    err: {
      type: "NotFoundException",
      message: "Cannot GET /api/invalid-endpoint",
      stack: "Error: Cannot GET /api/invalid-endpoint\n    at ..."
    }
```

**Verify:**
- [ ] Error is logged at `ERROR` level
- [ ] Error includes `err` object with type, message, stack

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

## Test Suite 3: Worker AI Logging

### 3.1 Start Worker AI

```bash
# Terminal 3
pnpm start:worker-ai
```

**Expected Output:**
```
[HH:MM:SS.mmm] INFO (WorkerAI): 🤖 Worker AI is running on: http://localhost:3001
    trace_id: "..."
    service_name: "worker-ai"

[HH:MM:SS.mmm] INFO (WorkerAI): 🌍 Environment: development
    trace_id: "..."
    service_name: "worker-ai"
```

**Verify:**
- [ ] Worker starts successfully
- [ ] `service_name: "worker-ai"` in logs
- [ ] `trace_id` is present

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

## Test Suite 4: Worker Ingestion Logging

### 4.1 Start Worker Ingestion

```bash
# Terminal 4
pnpm start:worker-ingestion
```

**Expected Output:**
```
[HH:MM:SS.mmm] INFO (WorkerIngestion): 📥 Worker Ingestion is running on: http://localhost:3002
    trace_id: "..."
    service_name: "worker-ingestion"

[HH:MM:SS.mmm] INFO (WorkerIngestion): 🌍 Environment: development
    trace_id: "..."
    service_name: "worker-ingestion"
```

**Verify:**
- [ ] Worker starts successfully
- [ ] `service_name: "worker-ingestion"` in logs
- [ ] `trace_id` is present

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

## Test Suite 5: Production Mode (NDJSON)

### 5.1 Test NDJSON Output

```bash
# Stop API (Ctrl+C in Terminal 1)

# Set production mode
export NODE_ENV=production
export LOG_PRETTY=false
export LOG_LEVEL=info

# Restart API
pnpm start:api
```

**Expected Output (NDJSON - one line per log):**
```json
{"level":"info","time":"2026-02-08T10:30:00.123Z","msg":"✅ Database connection established successfully","trace_id":"...","service_name":"gateway","context":"DatabaseService"}
{"level":"info","time":"2026-02-08T10:30:00.456Z","msg":"🚀 Application is running on: http://localhost:3000/api","trace_id":"...","service_name":"gateway","context":"Bootstrap"}
```

**Verify:**
- [ ] Logs are single-line JSON (not pretty-printed)
- [ ] Each log is valid JSON
- [ ] `trace_id` and `service_name` still present

**Test JSON Parsing:**
```bash
# Capture logs and parse with jq (if available)
pnpm start:api 2>&1 | head -n 5 | jq .
```

**Expected:** Valid JSON parsing, no errors

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

## Test Suite 6: Log Levels

### 6.1 Test Debug Level Filtering

```bash
# Terminal 1 - Start with LOG_LEVEL=info
export LOG_LEVEL=info
pnpm start:api

# Terminal 2 - Make request
curl http://localhost:3000/api/health/database
```

**Check Terminal 1 Logs:**
- [ ] INFO logs appear
- [ ] DEBUG logs (like "Executed query in Xms") do NOT appear

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 6.2 Test Debug Level Visibility

```bash
# Terminal 1 - Restart with LOG_LEVEL=debug
export LOG_LEVEL=debug
pnpm start:api

# Terminal 2 - Make request
curl http://localhost:3000/api/health/database
```

**Check Terminal 1 Logs:**
- [ ] INFO logs appear
- [ ] DEBUG logs (like "Executed query in Xms") DO appear

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

## Test Suite 7: Existing Tests Still Pass

### 7.1 Run Health Check Tests

```bash
# Stop all services (Ctrl+C in all terminals)

# Run health check E2E test
pnpm test:e2e apps/api/test/app.e2e-spec.ts
```

**Expected:** All tests pass

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

### 7.2 Run Authentication Tests

```bash
pnpm test:e2e:auth
```

**Expected:** All authentication tests pass

**Status:** [ ] ✅ PASS / [ ] ❌ FAIL

---

## Summary

### Total Tests: 18

**Configuration Tests:**
- [ ] 1.1 Dependencies installed
- [ ] 1.2 Config files exist
- [ ] 1.3 Environment variables

**API Gateway Tests:**
- [ ] 2.1 Startup logs
- [ ] 2.2 Health check
- [ ] 2.3 Database health check
- [ ] 2.4 Request correlation
- [ ] 2.5 Tenant context
- [ ] 2.6 Error logging

**Worker Tests:**
- [ ] 3.1 Worker AI startup
- [ ] 4.1 Worker Ingestion startup

**Production Tests:**
- [ ] 5.1 NDJSON output

**Log Level Tests:**
- [ ] 6.1 Debug filtering
- [ ] 6.2 Debug visibility

**Regression Tests:**
- [ ] 7.1 Health tests pass
- [ ] 7.2 Auth tests pass

---

## Final Checklist

Before committing, verify:

- [ ] All 18 tests passed
- [ ] No console errors during testing
- [ ] All services start successfully
- [ ] Logs are properly formatted
- [ ] `trace_id` appears in all logs
- [ ] `service_name` identifies services correctly
- [ ] `tenant_id` appears in authenticated requests
- [ ] Pretty-print works in development
- [ ] NDJSON works in production
- [ ] Existing E2E tests still pass

## Pass/Fail Summary

**Passed:** ___ / 18
**Failed:** ___ / 18

**Overall Status:** [ ] ✅ READY FOR COMMIT / [ ] ❌ NEEDS FIXES

---

**Testing Date:** _______________  
**Tested By:** _______________  
**Branch:** infra/logging-module/com-99-nestjs-pino-structured-logging

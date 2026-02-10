# Quick Logging Test

## ✅ Server is Running!

Your server started successfully. Now let's verify Pino logging is active.

## Test Commands

**In a NEW terminal, run:**

```bash
# Test 1: Main health check
curl http://localhost:3000/api/health

# Test 2: Database health check (CORRECT ENDPOINT: /db not /database)
curl http://localhost:3000/api/health/db

# Test 3: With custom trace ID
curl -H "x-request-id: test-trace-123" http://localhost:3000/api/health/db
```

## Expected Output in Server Terminal

### ✅ IF PINO IS WORKING:

You should see logs like this in Terminal 1:

```
[22:36:59.456] INFO: GET /api/health/database completed
    trace_id: "abc-123-def-456"
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

**Key Indicators:**
- ✅ `trace_id` field present
- ✅ `service_name: "gateway"` present
- ✅ Square bracket timestamp format `[HH:MM:SS.mmm]`
- ✅ Structured JSON-like output with indentation

### ❌ IF PINO IS NOT WORKING:

You'll see default NestJS logger format:

```
INFO [2026-02-07 22:36:59.456]: Request message
    context: "ClassName"
```

**Key Indicators:**
- ❌ No `trace_id` field
- ❌ No `service_name` field
- ❌ Shows `context:` instead
- ❌ Timestamp in brackets BEFORE log level

---

## Quick Fix if Pino Not Working

If you see the default format, restart the server:

```bash
# Terminal 1: Stop server (Ctrl+C)

# Clean and restart
rm -rf dist
pnpm build:api
pnpm start:api
```

---

## Verification

After running curl command, check Terminal 1 and report:

- [ ] Logs have `trace_id` field
- [ ] Logs have `service_name: "gateway"`
- [ ] Timestamp format is `[HH:MM:SS.mmm]`
- [ ] HTTP requests are auto-logged

**If all checkboxes are ✅, then PINO IS WORKING!**


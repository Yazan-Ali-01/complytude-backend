# Redis Session Management - Quick Start Guide

## Installation & Setup (5 minutes)

### 1. Install Dependencies
```bash
pnpm install
```

This installs:
- `ioredis@^5.4.2` - Redis client
- `@maxmind/geoip2-node@^5.0.0` - GeoIP lookup
- `ua-parser-js@^2.0.0` - User-Agent parsing
- `@types/ua-parser-js@^0.7.39` - TypeScript types

### 2. Update Environment Variables

Add these to `apps/api/.env`:

```env
# Redis (Session Management)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=complytude:

# Session Management
SESSION_MAX_TTL=14d
SESSION_IDLE_TIMEOUT=72h
SESSION_MAX_PER_USER=5
SESSION_ACTIVITY_THROTTLE_SECONDS=120
SERVICE_NAME=api

# MaxMind GeoIP (Optional - leave empty for now)
MAXMIND_LICENSE_KEY=
MAXMIND_DB_PATH=./data/GeoLite2-City.mmdb
```

### 3. Start Services

```bash
# Start Docker services (PostgreSQL + Redis + MinIO)
pnpm docker:services

# Start API in development mode
pnpm dev
```

### 4. Verify Logs

Look for these success messages:

```
✅ [RedisService] Redis client ready
✅ [GeoLocationService] MaxMind GeoIP disabled: MAXMIND_LICENSE_KEY or MAXMIND_DB_PATH not configured
✅ [NestApplication] Application is running on: http://localhost:3000/api
```

**Note:** The MaxMind warning is expected if you haven't set up GeoIP yet - sessions will work without it!

### 5. Test Login Flow

```bash
# Login (creates identity session)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456!"
  }'
```

**Expected log:**
```
[AuthService] User test@example.com logged in successfully (session: abc-123, device: desktop, Chrome, location: Unknown, Unknown)
```

### 6. Verify Session in Redis

```bash
# Connect to Redis
docker exec -it complytude-redis redis-cli

# List all identity sessions
KEYS complytude:identity-session:*

# Get session details
HGETALL complytude:identity-session:{sessionId}
```

## Testing Session Features

### Test Session Limit (5 devices)

Login 6 times with different User-Agents:

```bash
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -H "User-Agent: Device-$i" \
    -d '{"email":"test@example.com","password":"Test123456!"}'
done
```

Check logs - the 6th login should delete the oldest session.

### Test Password Change (invalidates all sessions)

```bash
# Change password
curl -X POST http://localhost:3000/api/users/change-password \
  -H "Content-Type: application/json" \
  -H "Cookie: tenantAccessToken=..." \
  -d '{
    "currentPassword": "Test123456!",
    "newPassword": "NewPass789!"
  }'
```

**Expected log:**
```
[SessionInvalidationService] Invalidated 3 identity sessions for user abc-123 (reason: password_changed)
```

Verify in Redis - all sessions deleted:
```bash
docker exec -it complytude-redis redis-cli KEYS complytude:identity-session:*
```

### Test Graceful Degradation

1. Stop Redis:
```bash
docker stop complytude-redis
```

2. Make authenticated request:
```bash
curl http://localhost:3000/api/health \
  -H "Cookie: identityAccessToken=..."
```

**Expected:**
- ✅ Request succeeds (auth still works)
- ⚠️ Log shows: `[JwtAuthGuard] Redis unavailable - falling back to JWT-only validation`

3. Start Redis again:
```bash
docker start complytude-redis
```

## Health Checks

```bash
# Comprehensive health check (all services)
curl http://localhost:3000/api/health

# Redis health check only
curl http://localhost:3000/api/health/redis

# Database health check only
curl http://localhost:3000/api/health/db
```

## Troubleshooting

### Error: "Cannot find module '@complytude/shared'"

**Solution:**
```bash
pnpm install
```

### Error: "Redis client error: ECONNREFUSED"

**Solution:**
```bash
# Check if Redis is running
docker ps | grep redis

# If not running, start it
pnpm docker:services
```

### Error: TypeScript compilation errors

**Solution:**
```bash
# Clean build
rm -rf dist/
pnpm build:api
```

### Warning: "MaxMind GeoIP disabled"

**This is normal!** Geolocation is optional. Sessions work without it.

**To enable:** Follow `docs/MAXMIND_SETUP.md`

## Optional: Setup MaxMind GeoIP

For full geolocation features, see comprehensive guide:

📖 **`docs/MAXMIND_SETUP.md`**

Quick summary:
1. Create MaxMind account
2. Download GeoLite2-City.mmdb
3. Add `MAXMIND_LICENSE_KEY` to `.env`
4. Restart API

## What's Working

✅ Redis session storage (identity + tenant sessions)  
✅ Session validation on every request  
✅ Instant token revocation  
✅ 5-device limit per user  
✅ Idle timeout (72h) + Absolute timeout (14d)  
✅ Device info extraction (User-Agent parsing)  
✅ Optional IP geolocation (MaxMind)  
✅ Graceful degradation (Redis down = JWT-only)  
✅ Security event hooks (password change, email change, password reset)  
✅ Health checks (Redis + Database)  

## What's Next

🔄 **User session endpoints** (list/delete/rename sessions) - Phase 4  
🔄 **Tenant admin endpoints** (manage user sessions) - Phase 6  
🔄 **System admin endpoints** (global session management) - Phase 7  
🔄 **API documentation updates** - Phase 9  

These will be implemented in the next iteration.

---

**Questions?** Check `docs/SESSION_MANAGEMENT.md` for full architecture details.

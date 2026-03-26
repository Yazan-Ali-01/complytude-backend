# Apidog Testing Guide: Redis Session Management

This guide covers testing the Redis-backed session management infrastructure. **Task 1** provides the foundation; **Task 2** adds `sessionId` to JWT payloads; **Task 3** wires auth flows (login, tenant-switch, refresh, logout) to Redis sessions; session API endpoints are added in later tasks.

---

## Prerequisites

1. **Services running:**

   ```bash
   docker-compose up -d postgres redis
   pnpm db:migrate
   pnpm db:seed
   ```

2. **Environment variables** (add to `.env` or ensure defaults):

   ```
   SESSION_MAX_TTL=14d
   SESSION_IDLE_TIMEOUT=72h
   SESSION_MAX_PER_USER=5
   SESSION_ACTIVITY_THROTTLE_SECONDS=120
   ```

3. **API running:**
   ```bash
   pnpm start:api
   ```
   Base URL: `http://localhost:3000`

---

## Tools

- **Apidog / Apifox / Postman:** Create a collection for session-related requests
- **cURL:** Use the examples for quick CLI testing

---

## Task 1: Infrastructure Verification

### 1. Redis Health Check

Verifies Redis is available (required for session operations).

**Endpoint:** `GET /api/health/redis`

**Auth:** None (version-neutral health endpoint)

**Request:**

```http
GET http://localhost:3000/api/health/redis
```

**cURL:**

```bash
curl -s http://localhost:3000/api/health/redis | jq
```

**Verify:**

- Status: `200 OK`
- Response indicates Redis is healthy (e.g. `status: "ok"` or similar from your health module)

---

### 2. API Startup with Session Config

Verifies the application starts with the new session environment variables.

**How to test:**

1. Ensure `.env` includes session vars (or rely on defaults).
2. Start the API: `pnpm start:api`
3. Confirm no startup errors related to `session` or `SESSION_*` config.

**Verify:**

- API starts successfully
- No `ConfigService` or validation errors for `SESSION_MAX_TTL`, `SESSION_IDLE_TIMEOUT`, etc.

---

## Task 2: JWT Payload & Strategy Verification

**What changed:** All four JWT payload types and `Authenticated*User` interfaces now include `sessionId`. Passport strategies extract it (or `''` for old tokens without sessionId).

### Verify Auth Flows Still Work

Until AuthService is wired to include `sessionId` in tokens (later task), JWTs will not contain `sessionId`. Strategies return `sessionId: ''` in that case. Auth flows must continue to work.

**1. Login**

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "existing@user.com",
  "password": "YourPassword123!"
}
```

**Verify:** `200 OK`, identity cookies set.

**2. Tenant Switch** (after login)

```http
POST http://localhost:3000/api/v1/auth/tenant-switch
Content-Type: application/json
Cookie: <identity cookies from login>

{
  "tenantId": "<valid-tenant-uuid>"
}
```

**Verify:** `200 OK`, tenant cookies set.

**3. Authenticated Request** (tenant endpoint)

```http
GET http://localhost:3000/api/v1/tenants/me
Cookie: <identity + tenant cookies>
```

**Verify:** `200 OK`, current tenant data returned. No 401 from strategy validation.

---

## Task 3: Auth Flow Integration Verification

**What changed:** Login creates Redis sessions. Refresh uses session validation. Logout deletes sessions. Tokens now include `sessionId`. Old tokens (pre–Task 3) are invalid — users must re-login.

### 1. Full Auth Flow (Login → Tenant Switch → API → Refresh → Logout)

**1.1 Login**

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0

{
  "email": "existing@user.com",
  "password": "YourPassword123!"
}
```

**Verify:** `200 OK`, `identityAccessToken` and `identityRefreshToken` in response, cookies set. Session created in Redis with device info.

**1.2 Tenant Switch**

```http
POST http://localhost:3000/api/v1/auth/tenant-switch
Content-Type: application/json
Cookie: <identity cookies from login>

{
  "tenantId": "<valid-tenant-uuid>"
}
```

**Verify:** `200 OK`, tenant cookies set.

**1.3 Refresh Identity Token**

```http
POST http://localhost:3000/api/v1/auth/refresh-identity
Cookie: <identity cookies>
```

**Verify:** `200 OK`, new access token cookie (refresh token unchanged).

**1.4 Refresh Tenant Token**

```http
POST http://localhost:3000/api/v1/auth/refresh-tenant
Cookie: <identity + tenant cookies>
```

**Verify:** `200 OK`, new tenant access token cookie.

**1.5 Logout**

```http
POST http://localhost:3000/api/v1/auth/logout
Cookie: <identity + tenant cookies>
```

**Verify:** `200 OK`, all cookies cleared. Subsequent requests with old tokens return 401.

### 2. Session Revocation (Logout Invalidates Tokens)

1. Login and tenant switch.
2. Copy cookies and make a request to `GET /api/v1/tenants/me` — should succeed.
3. Call logout.
4. Retry `GET /api/v1/tenants/me` with the same cookies — should return `401`.

### 3. Password Reset Invalidates All Sessions

1. Login from device A.
2. Request password reset, complete reset.
3. Retry an authenticated request with device A cookies — should return `401`.

---

## Task 5: User Session Endpoints

**What changed:** User session management endpoints added. List sessions (current tenant or all), logout specific session, logout all for current tenant, logout all for all tenants, rename session. Response includes `isCurrent` flag (matches sessionId from JWT).

### 1. List Sessions for Current Tenant

**Auth:** Identity + tenant access token (cookies)

**Request:**

```http
GET http://localhost:3000/api/v1/auth/sessions
Cookie: <identity + tenant cookies>
```

**Verify:** `200 OK`, response shape:

```json
{
  "sessions": [
    {
      "identitySession": {
        "sessionId": "uuid",
        "deviceInfo": { "deviceType": "desktop", "browserName": "Chrome", ... },
        "ipAddress": "192.168.1.1",
        "geoLocation": null,
        "sessionName": null,
        "createdAt": "2026-01-15T08:00:00.000Z",
        "lastActivityAt": "2026-01-20T14:30:00.000Z",
        "isCurrent": true
      },
      "tenantSessions": [
        {
          "sessionId": "uuid",
          "tenantId": "uuid",
          "role": "tenant_admin",
          "createdAt": "...",
          "lastActivityAt": "...",
          "isCurrent": true
        }
      ]
    }
  ]
}
```

`isCurrent` is true for the identity/tenant session used by the current request.

---

### 2. List All Sessions (Across All Tenants)

**Auth:** Identity access token only

**Request:**

```http
GET http://localhost:3000/api/v1/auth/sessions/all
Cookie: <identity cookies>
```

**Verify:** `200 OK`, same shape; `tenantSessions` includes sessions for all tenants.

---

### 3. Delete Specific Session

**Auth:** Identity access token

**Request:**

```http
DELETE http://localhost:3000/api/v1/auth/sessions/550e8400-e29b-41d4-a716-446655440000
Cookie: <identity cookies>
```

**Verify:** `200 OK`, `{ "message": "Logged out successfully" }`. If the deleted session was the current identity session, all auth cookies are cleared.

---

### 4. Logout All (Current Tenant)

**Auth:** Identity + tenant access token

**Request:**

```http
DELETE http://localhost:3000/api/v1/auth/sessions
Cookie: <identity + tenant cookies>
```

**Verify:** `200 OK`, tenant cookies cleared. All tenant sessions for current tenant (across devices) invalidated.

---

### 5. Logout All (All Tenants, All Devices)

**Auth:** Identity access token

**Request:**

```http
DELETE http://localhost:3000/api/v1/auth/sessions/all
Cookie: <identity cookies>
```

**Verify:** `200 OK`, all auth cookies cleared. All sessions invalidated.

---

### 6. Rename Session

**Auth:** Identity access token

**Request:**

```http
PATCH http://localhost:3000/api/v1/auth/sessions/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
Cookie: <identity cookies>

{
  "sessionName": "Work laptop"
}
```

**Verify:** `200 OK`, `{ "message": "Session renamed successfully" }`. Only identity sessions support renaming.

---

## Task 6: Security Event Hooks (UsersService)

**What changed:** Session state is in **Redis** (not PostgreSQL). `UsersService` invalidates via `SessionInvalidationService`. Session invalidation is wired as follows.

| Flow                   | Behavior                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `changePassword`       | After DB password update → `invalidateAllUserSessions(userId)`                                             |
| `removeUserFromTenant` | After row delete → `invalidateTenantSessions(targetUserId, tenantId)`                                      |
| `updateUser`           | If `role` changed or `isActive` set from true → false → `invalidateTenantSessions(targetUserId, tenantId)` |

### 1. Password Change Invalidates All Sessions

1. Login on two browsers (or two sessions).
2. From one session, call `PATCH /api/v1/users/me/password` with valid current + new password.
3. **Verify:** Other session’s requests return `401` after invalidation. User must log in again everywhere.

---

### 2. Remove User from Tenant Invalidates Tenant Sessions Only

1. User A is member of tenant T (has tenant session).
2. Tenant admin removes user A from tenant T.
3. **Verify:** User A’s tenant-scoped requests for T return `401`. Identity session may still exist until they log out or switch tenant.

---

### 3. Role Change or Deactivation Invalidates Tenant Sessions

1. Admin updates tenant user’s role (e.g. member → tenant_admin).
2. **Verify:** User’s previous tenant tokens are invalid; they must refresh or re-select tenant.

3. Admin sets `isActive: false` for a user.
4. **Verify:** Same — tenant sessions for that tenant cleared.

---

## Task 7: Tenant Admin Session Endpoints

**What changed:** Tenant admins can now inspect and invalidate another user's sessions within the current tenant scope. All endpoints require tenant access token plus `sessions:manage` permission.

### Required Permission

`sessions:manage` (or wildcard coverage such as `sessions:*` / `*:*`) must be present in the acting admin's tenant role.

---

### 1. List Target User Sessions in Current Tenant

**Auth:** Tenant access token (admin) with `sessions:manage`

**Request:**

```http
GET http://localhost:3000/api/v1/tenants/admin/users/660e8400-e29b-41d4-a716-446655440001/sessions
Cookie: <tenant cookies for acting admin>
```

**Verify:**

- `200 OK`
- Response shape matches `SessionListResponseDto`:
  - `sessions[].identitySession` includes device/IP/geo/name/timestamps
  - `sessions[].tenantSessions` includes only sessions where `tenantId` equals current tenant
- If the target user has no active tenant sessions in this tenant: `sessions: []`

**Negative checks:**

- Missing permission → `403`
- Target user not in tenant (or inactive membership) → `404`

---

### 2. Force Logout Target User from Current Tenant (All Devices)

**Auth:** Tenant access token (admin) with `sessions:manage`

**Request:**

```http
DELETE http://localhost:3000/api/v1/tenants/admin/users/660e8400-e29b-41d4-a716-446655440001/sessions
Cookie: <tenant cookies for acting admin>
```

**Verify:**

- `200 OK`, `{ "message": "User sessions invalidated successfully" }`
- Target user's requests in this tenant fail (`401`) using old tenant tokens
- Target user's identity session can still remain valid for other tenant operations until separately invalidated

**Negative checks:**

- Missing permission → `403`
- Target user not in tenant (or inactive membership) → `404`

---

### 3. Force Logout a Specific Target Tenant Session

**Auth:** Tenant access token (admin) with `sessions:manage`

**Request:**

```http
DELETE http://localhost:3000/api/v1/tenants/admin/users/660e8400-e29b-41d4-a716-446655440001/sessions/550e8400-e29b-41d4-a716-446655440000
Cookie: <tenant cookies for acting admin>
```

**Verify:**

- `200 OK`, `{ "message": "Session invalidated successfully" }`
- Only the targeted tenant session is removed
- Other target sessions in same tenant continue to work

**Negative checks:**

- Session belongs to another user or another tenant → `404`
- Missing permission → `403`
- Target user not in tenant (or inactive membership) → `404`

---

## Task 8: System Admin Session Endpoints

**What changed:** System administrators (`platformRole === system_admin` on the identity JWT) can view global session statistics, list sanitized sessions by tenant or user, and force-logout sessions. Every request writes a break-glass row via `AuditService` (`action: SYSTEM_ADMIN_SESSION_ACCESS`, `details.type: BREAK_GLASS`).

### Prerequisites

1. Identity access token for a user whose JWT includes `"platformRole": "system_admin"`.
2. Same cookie header for all requests below.

**Negative:** User with `platformRole: null`, `support`, or `auditor` → `403 System administrator role required`.

---

### 1. Global Session Statistics

**Request:**

```http
GET http://localhost:3000/api/v1/admin/sessions/stats
Cookie: <identity cookies (system_admin)>
```

**Verify:**

- `200 OK`
- Body includes `totalIdentitySessions`, `totalTenantSessions`, `byTenantId` (map of tenant UUID → count), `byDeviceType` (e.g. `desktop`, `mobile`)
- Audit log row created for `resourceId: global-stats`, `operationType: view`

---

### 2. List Sessions in a Tenant (Sanitized)

**Request:**

```http
GET http://localhost:3000/api/v1/admin/tenants/770e8400-e29b-41d4-a716-446655440002/sessions
Cookie: <identity cookies (system_admin)>
```

**Verify:**

- `200 OK`, `sessions` array; each item has `identitySession` (no email) and `tenantSessions` for that tenant only
- `durationSeconds` present on rows
- Audit log includes `targetTenantId` / `resourceId` = tenant id

---

### 3. List User Sessions Across All Tenants (Sanitized)

**Request:**

```http
GET http://localhost:3000/api/v1/admin/users/660e8400-e29b-41d4-a716-446655440001/sessions
Cookie: <identity cookies (system_admin)>
```

**Verify:**

- `200 OK`, grouped sessions for that `userId` across tenants
- Audit log includes `targetUserId`

---

### 4. Force Logout User Globally

**Request:**

```http
DELETE http://localhost:3000/api/v1/admin/users/660e8400-e29b-41d4-a716-446655440001/sessions
Cookie: <identity cookies (system_admin)>
```

**Verify:**

- `200 OK`, `{ "message": "All user sessions invalidated successfully" }`
- That user’s cookies no longer work for authenticated routes
- Audit log: `operationType: force_logout`, `scope: all_user_sessions`

---

### 5. Force Logout Specific Session

**Request:**

```http
DELETE http://localhost:3000/api/v1/admin/sessions/550e8400-e29b-41d4-a716-446655440000
Cookie: <identity cookies (system_admin)>
```

**Verify:**

- `200 OK`, `{ "message": "Session invalidated successfully" }` if session exists
- `404` if UUID is not an existing identity or tenant session key
- Deleting an **identity** session removes linked tenant sessions (cascade)
- Audit log: `operationType: force_logout`, `targetSessionId`

---

## Task 4: MaxMind GeoIP Integration

**What changed:** Login performs fire-and-forget GeoIP lookup. Sessions are created with `geoLocation: null`; when the lookup succeeds, the session is updated asynchronously with city, country, and country code. Geo is disabled when `MAXMIND_DB_PATH` is empty or the database file does not exist.

### 1. Geo Disabled (Default)

With no GeoLite2-City database, geo lookup is disabled. Login works normally; sessions have `geoLocation: null`.

**Request:**

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "existing@user.com",
  "password": "YourPassword123!"
}
```

**Verify:** `200 OK`, login succeeds. Session in Redis has `geoLocation: null`. No errors in logs.

---

### 2. Geo Enabled (With GeoLite2-City Database)

**Setup:**

1. Get MaxMind license key: https://www.maxmind.com/en/accounts/current/license-key
2. Download database:
   ```bash
   MAXMIND_LICENSE_KEY=your_key ./scripts/download-geolite2-city.sh
   ```
3. Ensure `MAXMIND_DB_PATH=./data/GeoLite2-City.mmdb` in `.env` (or correct path)
4. Restart API

**Request:**

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json
X-Forwarded-For: 8.8.8.8

{
  "email": "existing@user.com",
  "password": "YourPassword123!"
}
```

**Note:** If behind a proxy, ensure `request.ip` reflects the client IP. For local testing, `127.0.0.1` returns null (private IP). Use `X-Forwarded-For` if your stack forwards it to `request.ip`.

**Verify:**

- `200 OK`, login succeeds
- Session is enriched asynchronously — after a short delay, Redis session should have `geoLocation: { country, city, countryCode }` (e.g. for 8.8.8.8: US, Ashburn, US)

---

### 3. Fire-and-Forget Behavior

**Verify:** Login response returns immediately. Geo enrichment does not block the response. Check logs for `GeoLocationService: GeoLite2-City database loaded` on startup when DB exists.

---

## Automated integration tests (Jest)

| File                                                        | What it covers                                                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/auth/sessions.lifecycle.integration.spec.ts` | Login → Redis identity session → tenant switch → tenant session → logout → keys removed                                                                           |
| `apps/api/test/auth/sessions.security.integration.spec.ts`  | Password change clears all sessions; `SessionInvalidationService.invalidateTenantSessions` clears tenant scope (same primitive as role change / deactivate hooks) |
| `apps/api/test/auth/sessions.endpoints.integration.spec.ts` | HTTP `inject` for `/api/v1/auth/sessions*`, tenant-admin sessions, system-admin stats                                                                             |

Run (Docker Postgres + Redis testcontainers must be up):

```bash
pnpm test:integration --testPathPattern=sessions --runInBand
```

`createTestApp()` mirrors production routing: `@fastify/cookie`, `setGlobalPrefix('api')`, URI versioning → use **`/api/v1/...`** in requests.

**Faster session cycles in tests:** `apps/api/.env.test` sets `SESSION_MAX_TTL=60s` and `SESSION_IDLE_TIMEOUT=30s`. Use production-like values in `.env` when validating long-lived sessions manually.

## Multi-tenant switching and tenant sessions

- Each **tenant switch** creates a **tenant session** in Redis, linked to the active **identity session**.
- The same identity session can have multiple tenant sessions (one per tenant the user has switched to in that browser).
- After switching, call `GET /api/v1/auth/sessions` (identity + tenant cookies) to list sessions **for the current tenant**; `GET /api/v1/auth/sessions/all` lists across all tenants.

---

## Session Configuration Reference

| Variable                            | Default                     | Description                                            |
| ----------------------------------- | --------------------------- | ------------------------------------------------------ |
| `SESSION_MAX_TTL`                   | `14d`                       | Absolute session lifetime (`14d`, `72h`, `30m`, `60s`) |
| `SESSION_IDLE_TIMEOUT`              | `72h`                       | Session expires if inactive beyond this                |
| `SESSION_MAX_PER_USER`              | `5`                         | Max identity sessions; oldest evicted when exceeded    |
| `SESSION_ACTIVITY_THROTTLE_SECONDS` | `120`                       | Min interval between `lastActivityAt` updates          |
| `MAXMIND_LICENSE_KEY`               | (empty)                     | MaxMind license key for download script                |
| `MAXMIND_DB_PATH`                   | `./data/GeoLite2-City.mmdb` | Path to GeoLite2-City DB; empty or missing = disabled  |

---

[Back to API Documentation](README.md)

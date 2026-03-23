# Testing: Onboarding State & Seat Enforcement

This guide covers manual testing for the onboarding metadata schema and seat capacity enforcement on invitation flows.

## Prerequisites

1. **Services running:**

   ```bash
   docker-compose up -d postgres redis
   pnpm db:migrate
   pnpm db:seed
   ```

2. **API running:**
   ```bash
   pnpm start:api
   ```
   Base URL: `http://localhost:3000` (or your configured port)

## Tools

- **ApiDog / Apifox / Postman:** Create a collection with the requests below
- **cURL:** Use the examples for quick CLI testing

---

## 1. Tenant Creation — Default Onboarding Metadata

**Endpoint:** `POST /api/v1/tenants`

**Auth:** Identity token (from signup/login)

**Request:**

```json
{
  "name": "Test Workspace"
}
```

**Verify:**

- Response includes `onboarding_metadata` with:
  - `currentStep`: `"invite_team"`
  - `teamInviteSkipped`: `false`
  - `firstActionType`: `null`
  - `stepsCompleted.createWorkspace`: `true`
  - `stepsCompleted.inviteTeam`: `false`
  - `stepsCompleted.firstAction`: `false`

---

## 2. PATCH Onboarding — Validation

**Endpoint:** `PATCH /api/v1/tenants/me/onboarding`

**Auth:** Tenant token + `settings:manage` permission

**Valid request:**

```json
{
  "currentStep": "first_action",
  "teamInviteSkipped": true
}
```

**Invalid `currentStep` (expect 400):**

```json
{
  "currentStep": "invalid_step"
}
```

**Invalid `firstActionType` (expect 400):**

```json
{
  "firstActionType": "invalid_action"
}
```

**Valid `firstActionType`:**

```json
{
  "firstActionType": "upload_contract"
}
```

---

## 3. Seat Capacity — Invitation Accept (403)

**Setup:** Tenant with **Navigator plan (1 seat)**. The creator is already the only member.

**Flow:**

1. Tenant admin creates invitation: `POST /api/v1/tenants/admin/invitations` with `{ "email": "invitee@example.com" }`
2. Invitee accepts: `POST /api/v1/auth/invitations/:invitationId/accept`

**Expected:** Accept succeeds (invitee becomes 2nd member — wait, Navigator has 1 seat!). So:

- Navigator = 1 seat. Creator is 1 member. Creating an invitation for a new person should **fail at create time** with 403 (members + pending >= 1).
- To test **accept** 403: Use **Shield (3 seats)**. Add 3 members. Create 4th invitation. Accept with 4th user → expect 403 at accept.

**Simpler flow for accept 403:**

1. Tenant with Shield (3 seats)
2. Add 2 members (total 3 active)
3. Create invitation for 4th email
4. Accept as 4th user → **403** with message "Workspace has reached its seat limit..."

---

## 4. Seat Capacity — Invitation Create (403)

**Setup:** Tenant with **Navigator plan (1 seat)**. Creator is the only member.

**Request:** `POST /api/v1/tenants/admin/invitations`

```json
{
  "email": "newuser@example.com"
}
```

**Expected:** **403 Forbidden** with message like "Cannot send invitation. Workspace has reached its seat limit including pending invitations..."

**Reason:** 1 active member + 0 pending = 1, limit = 1 → at capacity.

---

## 5. Happy Path — Invitation Under Capacity

**Setup:** Tenant with **Shield plan (3 seats)**. 1 member (creator).

**Create invitation:** `POST /api/v1/tenants/admin/invitations` → 201

**Accept invitation:** `POST /api/v1/auth/invitations/:id/accept` → 200

---

## Quick cURL Examples

```bash
# 1. Login (get identity token)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}' \
  -c cookies.txt

# 2. Create tenant (verify onboarding_metadata in response)
curl -X POST http://localhost:3000/api/v1/tenants \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"My Workspace"}'

# 3. Switch to tenant (get tenant token)
curl -X POST http://localhost:3000/api/v1/auth/tenant-switch \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"tenantId":"<tenant-id>"}'

# 4. Update onboarding
curl -X PATCH http://localhost:3000/api/v1/tenants/me/onboarding \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"currentStep":"first_action","teamInviteSkipped":true}'

# 5. Create invitation (expect 403 on Navigator with 1 member)
curl -X POST http://localhost:3000/api/v1/tenants/admin/invitations \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"email":"invitee@example.com"}'
```

---

## Integration Tests

Run the full test suite to ensure no regressions:

```bash
pnpm test:integration
```

Existing smoke and integration tests should pass.

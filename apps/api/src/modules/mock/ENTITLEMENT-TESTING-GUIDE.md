# Entitlement Engine Testing Guide - Phase 1+2

Complete manual testing guide for the entitlement system foundation.

## ⚠️ Multi-Source Allocations Architecture

**Important:** The entitlement system now supports **multi-source funding allocations** for usage events.

- Each `usage_ledger` event can have **multiple funding sources** (plan + credit, addon + credit, etc.)
- Funding attribution is tracked in the `usage_allocations` table (1..N allocations per usage event)
- **Partial credit fallback** is implemented: when quota is exceeded, remaining plan quota is used first, then credits fill the gap
- API responses include both `source` (primary or 'mixed') and `allocations` array for detailed breakdown

**Example:** If you have 1 unit remaining in your plan and request 5 units with credits available:
- Old behavior: All 5 units charged to credits
- New behavior: 1 unit from plan + 4 units from credits (more cost-effective)

---

## Prerequisites

### 1. Setup Database

```bash
# Stop and reset database
pnpm docker:stop
pnpm docker:down
pnpm docker:start

# Run migrations
pnpm db:migrate

# Run ALL seeds (including new 008_seed_test_entitlements.sql)
pnpm db:seed
```

### 2. Start Application

```bash
pnpm dev
```

**Watch for sync logs:**

```
Starting Entitlement sync...
Syncing 15 features to database...
Syncing 4 plans to database...
Syncing plan entitlements for 4 plans...
Entitlement sync completed successfully
```

### 3. Get Authentication Tokens

You'll need tenant access tokens for testing. Use existing test users:

```bash
# Login as Tenant 1 admin (general_counsel plan)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tenant1.test",
    "password": "Test123!@#"
  }'

# Select tenant (get tenant token)
curl -X POST http://localhost:3000/api/auth/tenant/select \
  -H "Content-Type: application/json" \
  -H "Cookie: identityAccessToken=<identity_token>" \
  -d '{
    "tenantId": "11111111-1111-4111-8111-111111111111"
  }'
```

**Save the `tenantAccessToken` cookie for testing.**

---

## Test Data Overview

After running seed `008_seed_test_entitlements.sql`:

| Tenant       | Plan            | Base Limits                                                  | Add-ons      | Overrides             | Effective Limits             |
| ------------ | --------------- | ------------------------------------------------------------ | ------------ | --------------------- | ---------------------------- |
| **Tenant 1** | general_counsel | 100 docs, 30 reviews, full library, jais_native, redlining ✓ | None         | None                  | **100 docs, 30 reviews**     |
| **Tenant 2** | shield          | 25 docs, 5 reviews, essential library, standard quality      | **+50 docs** | None                  | **75 docs, 5 reviews**       |
| **Tenant 3** | infrastructure  | Unlimited (-1)                                               | None         | **500 docs override** | **500 docs (override wins)** |

---

## Test Endpoints

### Category 1: Public Entitlement Endpoints (No Auth)

#### 1.1 List All Plans

```bash
curl -X GET http://localhost:3000/api/entitlements/plans
```

**Expected Response:**

```json
[
  {
    "id": "<uuid>",
    "key": "navigator",
    "name": "Navigator",
    "description": "Lead magnet — Regulatory Watch + basic Chat with Law",
    "priceMonthly": 0,
    "priceCurrency": "AED",
    "billingPeriod": "monthly",
    "entitlements": {
      "documents_per_month": {
        "featureKey": "documents_per_month",
        "featureType": "quota",
        "valueInt": 3,
        "source": "plan"
      },
      "template_library": {
        "featureKey": "template_library",
        "featureType": "boolean",
        "valueText": "essential",
        "source": "plan"
      }
      // ... all 15 features
    }
  }
  // ... 3 more plans
]
```

**What to verify:**

- ✅ Returns 4 plans (navigator, shield, general_counsel, infrastructure)
- ✅ Each plan has 15 entitlements
- ✅ Prices match: 0, 249, 599, 2499
- ✅ Feature values match the matrix

#### 1.2 Get Specific Plan

```bash
curl -X GET http://localhost:3000/api/entitlements/plans/shield
```

**Expected Response:**

```json
{
  "id": "<uuid>",
  "key": "shield",
  "name": "Shield",
  "priceMonthly": 249,
  "entitlements": {
    "documents_per_month": { "valueInt": 25 },
    "template_library": { "valueText": "essential" },
    "redlining_enabled": { "valueBool": false }
    // ... all features
  }
}
```

**What to verify:**

- ✅ Returns shield plan details
- ✅ documents_per_month = 25
- ✅ template_library = 'essential'
- ✅ redlining_enabled = false

---

### Category 2: Tenant Entitlement Endpoints (Requires Tenant Token)

#### 2.1 Get Current Tenant Entitlements (Tenant 1 - No Add-ons/Overrides)

```bash
curl -X GET http://localhost:3000/api/entitlements/current \
  -H "Cookie: tenantAccessToken=<tenant1_token>"
```

**Expected Response:**

```json
{
  "tenantId": "11111111-1111-4111-8111-111111111111",
  "plan": "general_counsel",
  "entitlements": {
    "documents_per_month": {
      "featureKey": "documents_per_month",
      "featureType": "quota",
      "valueInt": 100,
      "source": "plan"
    },
    "template_library": {
      "featureKey": "template_library",
      "featureType": "boolean",
      "valueText": "full",
      "source": "plan"
    },
    "redlining_enabled": {
      "featureKey": "redlining_enabled",
      "featureType": "boolean",
      "valueBool": true,
      "source": "plan"
    }
    // ... all 15 features
  }
}
```

**What to verify:**

- ✅ tenantId matches
- ✅ plan = "general_counsel"
- ✅ documents_per_month = 100 (from plan, no add-ons)
- ✅ template_library = "full"
- ✅ redlining_enabled = true
- ✅ source = "plan" for all (no add-ons/overrides)

#### 2.2 Get Current Tenant Entitlements (Tenant 2 - WITH Add-on)

```bash
# Login as Tenant 2 admin first
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@tenant2.test", "password": "Test123!@#"}'

# Select tenant 2
curl -X POST http://localhost:3000/api/auth/tenant/select \
  -H "Cookie: identityAccessToken=<identity_token>" \
  -d '{"tenantId": "22222222-2222-4222-8222-222222222222"}'

# Get entitlements
curl -X GET http://localhost:3000/api/entitlements/current \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected Response:**

```json
{
  "tenantId": "22222222-2222-4222-8222-222222222222",
  "plan": "shield",
  "entitlements": {
    "documents_per_month": {
      "featureKey": "documents_per_month",
      "featureType": "quota",
      "valueInt": 75,
      "source": "addon"
    }
    // ... other features with source: "plan"
  }
}
```

**What to verify:**

- ✅ documents_per_month = **75** (25 plan + 50 addon) ← **KEY TEST**
- ✅ source = "addon" for documents_per_month
- ✅ All other features = plan values (no add-on for them)

#### 2.3 Get Current Tenant Entitlements (Tenant 3 - WITH Override)

```bash
# Login as Tenant 3 admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@tenant3.test", "password": "Test123!@#"}'

# Select tenant 3
curl -X POST http://localhost:3000/api/auth/tenant/select \
  -H "Cookie: identityAccessToken=<identity_token>" \
  -d '{"tenantId": "33333333-2222-4222-8222-333333333333"}'

# Get entitlements
curl -X GET http://localhost:3000/api/entitlements/current \
  -H "Cookie: tenantAccessToken=<tenant3_token>"
```

**Expected Response:**

```json
{
  "tenantId": "33333333-2222-4222-8222-333333333333",
  "plan": "infrastructure",
  "entitlements": {
    "documents_per_month": {
      "featureKey": "documents_per_month",
      "featureType": "quota",
      "valueInt": 500,
      "source": "override"
    },
    "contract_reviews_per_month": {
      "valueInt": -1,
      "source": "plan"
    }
    // ... other features
  }
}
```

**What to verify:**

- ✅ documents_per_month = **500** (override, not -1 from plan) ← **KEY TEST**
- ✅ source = "override" for documents_per_month
- ✅ contract_reviews_per_month = -1 (unlimited, from plan)
- ✅ All other features = plan values

---

### Category 3: Mock Controller Tests (Entitlement Guard)

#### 3.1 Boolean Feature Test - Redlining (Should Pass)

```bash
# Tenant 1 (general_counsel) - HAS redlining
curl -X POST http://localhost:3000/api/mock/entitlements/redlining/analyze \
  -H "Cookie: tenantAccessToken=<tenant1_token>"
```

**Expected:** ✅ 200 OK

```json
{
  "message": "Redlining accessed by admin@tenant1.test",
  "feature": "redlining_enabled",
  "status": "enabled"
}
```

#### 3.2 Boolean Feature Test - Redlining (Should Fail)

```bash
# Tenant 2 (shield) - NO redlining
curl -X POST http://localhost:3000/api/mock/entitlements/redlining/analyze \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected:** ❌ 403 Forbidden

```json
{
  "statusCode": 403,
  "message": "Your plan does not include this feature",
  "feature": "redlining_enabled",
  "required": "redlining_enabled must be true",
  "current": "false"
}
```

#### 3.3 Tiered Text Feature - Full Template Library (Should Pass)

```bash
# Tenant 1 (general_counsel) - HAS full library
curl -X GET http://localhost:3000/api/mock/entitlements/templates/premium \
  -H "Cookie: tenantAccessToken=<tenant1_token>"
```

**Expected:** ✅ 200 OK

```json
{
  "message": "Premium templates accessed by admin@tenant1.test",
  "feature": "template_library",
  "tier": "full"
}
```

#### 3.4 Tiered Text Feature - Full Template Library (Should Fail)

```bash
# Tenant 2 (shield) - Only has 'essential'
curl -X GET http://localhost:3000/api/mock/entitlements/templates/premium \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected:** ❌ 403 Forbidden

```json
{
  "statusCode": 403,
  "message": "Your plan does not include this feature",
  "feature": "template_library",
  "required": "template_library must be 'full'",
  "current": "'essential'"
}
```

#### 3.5 Quota Minimum - 50 Documents (Should Pass with Add-on)

```bash
# Tenant 2 (shield + addon) - Has 75 documents (25+50)
curl -X POST http://localhost:3000/api/mock/entitlements/documents/bulk-generate \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected:** ✅ 200 OK

```json
{
  "message": "Bulk generation by admin@tenant2.test",
  "feature": "documents_per_month",
  "minimumRequired": 50
}
```

**What to verify:**

- ✅ Tenant 2 passes even though base plan (shield) only has 25 documents
- ✅ Add-on merging works: 25 + 50 = 75 ≥ 50 ← **KEY TEST**

#### 3.6 Quota Minimum - 50 Documents (Should Fail Without Add-on)

To test this, you'd need a shield tenant WITHOUT the add-on. For now, test with Tenant 1 (has 100, should pass).

#### 3.7 Capacity Minimum - 5 Seats (Should Pass)

```bash
# Tenant 1 (general_counsel) - Has 10 seats
curl -X POST http://localhost:3000/api/mock/entitlements/team/bulk-invite \
  -H "Cookie: tenantAccessToken=<tenant1_token>"
```

**Expected:** ✅ 200 OK

#### 3.8 Capacity Minimum - 5 Seats (Should Fail)

```bash
# Tenant 2 (shield) - Only has 3 seats
curl -X POST http://localhost:3000/api/mock/entitlements/team/bulk-invite \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected:** ❌ 403 Forbidden

#### 3.9 Infrastructure-Only Feature

```bash
# Tenant 3 (infrastructure) - HAS custom_playbooks
curl -X POST http://localhost:3000/api/mock/entitlements/playbooks/upload \
  -H "Cookie: tenantAccessToken=<tenant3_token>"
```

**Expected:** ✅ 200 OK

```bash
# Tenant 1 (general_counsel) - NO custom_playbooks
curl -X POST http://localhost:3000/api/mock/entitlements/playbooks/upload \
  -H "Cookie: tenantAccessToken=<tenant1_token>"
```

**Expected:** ❌ 403 Forbidden

#### 3.10 Multiple Boolean Features (AND Logic)

```bash
# Tenant 1 (general_counsel) - HAS both redlining AND localizer_check
curl -X POST http://localhost:3000/api/mock/entitlements/contracts/advanced-analysis \
  -H "Cookie: tenantAccessToken=<tenant1_token>"
```

**Expected:** ✅ 200 OK

```bash
# Tenant 2 (shield) - Missing both
curl -X POST http://localhost:3000/api/mock/entitlements/contracts/advanced-analysis \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected:** ❌ 403 Forbidden

---

### Category 4: Debug Endpoints (No Guard)

#### 4.1 Show All Resolved Entitlements

```bash
# Tenant 1 (no add-ons/overrides)
curl -X GET http://localhost:3000/api/mock/entitlements/debug/resolved \
  -H "Cookie: tenantAccessToken=<tenant1_token>"
```

**Expected:**

```json
{
  "tenantId": "11111111-1111-4111-8111-111111111111",
  "role": "tenant_admin",
  "entitlements": {
    "documents_per_month": {
      "feature_key": "documents_per_month",
      "feature_type": "quota",
      "value_int": 100,
      "source": "plan"
    }
    // ... all 15 features
  }
}
```

```bash
# Tenant 2 (WITH add-on)
curl -X GET http://localhost:3000/api/mock/entitlements/debug/resolved \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected:**

- ✅ documents_per_month.value_int = **75** (merged)
- ✅ documents_per_month.source = "addon"

```bash
# Tenant 3 (WITH override)
curl -X GET http://localhost:3000/api/mock/entitlements/debug/resolved \
  -H "Cookie: tenantAccessToken=<tenant3_token>"
```

**Expected:**

- ✅ documents_per_month.value_int = **500** (override)
- ✅ documents_per_month.source = "override"

#### 4.2 Show Specific Feature Resolution

```bash
# Check documents_per_month for Tenant 2 (with add-on)
curl -X GET http://localhost:3000/api/mock/entitlements/debug/feature/documents_per_month \
  -H "Cookie: tenantAccessToken=<tenant2_token>"
```

**Expected:**

```json
{
  "tenantId": "22222222-2222-4222-8222-222222222222",
  "featureKey": "documents_per_month",
  "entitlement": {
    "feature_key": "documents_per_month",
    "feature_type": "quota",
    "value_int": 75,
    "source": "addon"
  }
}
```

---

## Test Matrix

### Tenant 1 (general_counsel) - Base Plan Only

| Endpoint                                         | Expected | Reason                   |
| ------------------------------------------------ | -------- | ------------------------ |
| `/entitlements/current`                          | ✅ 200   | Returns all entitlements |
| `/mock/entitlements/redlining/analyze`           | ✅ 200   | Has redlining            |
| `/mock/entitlements/templates/premium`           | ✅ 200   | Has full library         |
| `/mock/entitlements/documents/jais-native`       | ✅ 200   | Has jais_native          |
| `/mock/entitlements/documents/bulk-generate`     | ✅ 200   | 100 docs ≥ 50            |
| `/mock/entitlements/team/bulk-invite`            | ✅ 200   | 10 seats ≥ 5             |
| `/mock/entitlements/playbooks/upload`            | ❌ 403   | No custom_playbooks      |
| `/mock/entitlements/contracts/advanced-analysis` | ✅ 200   | Has both features        |

### Tenant 2 (shield + Add-on) - Tests Add-on Merging

| Endpoint                                     | Expected | Reason                           |
| -------------------------------------------- | -------- | -------------------------------- |
| `/entitlements/current`                      | ✅ 200   | Returns merged entitlements      |
| `/mock/entitlements/redlining/analyze`       | ❌ 403   | No redlining                     |
| `/mock/entitlements/templates/premium`       | ❌ 403   | Only essential library           |
| `/mock/entitlements/documents/jais-native`   | ❌ 403   | Only standard quality            |
| `/mock/entitlements/documents/bulk-generate` | ✅ 200   | **75 docs (25+50) ≥ 50** ← KEY   |
| `/mock/entitlements/team/bulk-invite`        | ❌ 403   | Only 3 seats < 5                 |
| `/mock/entitlements/playbooks/upload`        | ❌ 403   | No custom_playbooks              |
| `/mock/entitlements/debug/resolved`          | ✅ 200   | Shows documents=75, source=addon |

### Tenant 3 (infrastructure + Override) - Tests Override Precedence

| Endpoint                               | Expected | Reason                                         |
| -------------------------------------- | -------- | ---------------------------------------------- |
| `/entitlements/current`                | ✅ 200   | Returns overridden entitlements                |
| `/mock/entitlements/redlining/analyze` | ✅ 200   | Has redlining                                  |
| `/mock/entitlements/templates/premium` | ✅ 200   | Has full library                               |
| `/mock/entitlements/playbooks/upload`  | ✅ 200   | Has custom_playbooks                           |
| `/mock/entitlements/debug/resolved`    | ✅ 200   | Shows documents=**500**, source=override ← KEY |

---

## Key Test Scenarios

### Scenario 1: Add-on Merging (Tenant 2)

**Goal:** Verify that add-ons correctly add to plan entitlements.

**Test:**

1. Query `/entitlements/current` for Tenant 2
2. Check `documents_per_month.valueInt`
3. Verify it's **75** (not 25)
4. Verify `source` is "addon"

**Expected Behavior:**

- Plan: shield = 25 documents
- Add-on: extra_50_documents = +50 documents
- **Effective: 75 documents**

### Scenario 2: Override Precedence (Tenant 3)

**Goal:** Verify that overrides take full precedence over plan.

**Test:**

1. Query `/entitlements/current` for Tenant 3
2. Check `documents_per_month.valueInt`
3. Verify it's **500** (not -1 from infrastructure plan)
4. Verify `source` is "override"

**Expected Behavior:**

- Plan: infrastructure = -1 (unlimited)
- Override: 500 documents
- **Effective: 500 documents (override wins)**

### Scenario 3: EntitlementGuard Enforcement

**Goal:** Verify guard correctly blocks access based on entitlements.

**Test:**

1. Tenant 2 (shield) tries to access redlining endpoint
2. Should get 403 Forbidden
3. Error message should explain feature requirement

**Expected Behavior:**

- Guard checks `redlining_enabled` entitlement
- Tenant 2 has `value_bool: false`
- Guard throws `ForbiddenException`

### Scenario 4: Minimum Value Check

**Goal:** Verify minimum value checks work for quota/capacity.

**Test:**

1. Tenant 2 (shield + addon = 75 docs) tries bulk-generate (requires 50)
2. Should pass (75 ≥ 50)
3. Tenant 2 tries bulk-invite (requires 5 seats, has 3)
4. Should fail (3 < 5)

---

## Database Verification Queries

### Verify Subscriptions Created

```sql
SELECT
    t.id as tenant_id,
    t.plan as tenant_plan_column,
    p.key as subscription_plan_key,
    ts.status,
    ts.current_period_start,
    ts.current_period_end
FROM public.tenants t
JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
JOIN public.plans p ON p.id = ts.plan_id
WHERE ts.status = 'active'
ORDER BY t.id;
```

**Expected:**

- 3 rows (one per test tenant)
- `tenant_plan_column` matches `subscription_plan_key`

### Verify Add-ons

```sql
SELECT
    t.id as tenant_id,
    a.key as addon_key,
    ta.quantity,
    ta.status,
    f.key as feature_key,
    ae.value_int as addon_value
FROM public.tenant_addons ta
JOIN public.tenants t ON t.id = ta.tenant_id
JOIN public.addons a ON a.id = ta.addon_id
JOIN public.addon_entitlements ae ON ae.addon_id = ta.addon_id
JOIN public.features f ON f.id = ae.feature_id
WHERE ta.status = 'active';
```

**Expected:**

- 1 row: Tenant 2 has `extra_50_documents` add-on
- `addon_value` = 50

### Verify Overrides

```sql
SELECT
    t.id as tenant_id,
    f.key as feature_key,
    tor.value_int,
    tor.reason,
    tor.is_active,
    tor.expires_at
FROM public.tenant_overrides tor
JOIN public.tenants t ON t.id = tor.tenant_id
JOIN public.features f ON f.id = tor.feature_id
WHERE tor.is_active = true;
```

**Expected:**

- 1 row: Tenant 3 has override for `documents_per_month` = 500

---

## Testing Checklist

### Database Layer

- [ ] All migrations run successfully
- [ ] All seeds populate correctly
- [ ] 15 features in `public.features`
- [ ] 4 plans in `public.plans`
- [ ] 60 plan_entitlements (4 × 15)
- [ ] 3 tenant_subscriptions created
- [ ] 1 tenant_addon created (Tenant 2)
- [ ] 1 tenant_override created (Tenant 3)

### Sync Service

- [ ] EntitlementSyncService runs on app startup
- [ ] Features synced from constants to DB
- [ ] Plans synced from constants to DB
- [ ] Plan entitlements synced (60 rows)
- [ ] No errors in logs

### Entitlement Resolution

- [ ] Tenant 1: All entitlements from plan only
- [ ] Tenant 2: documents_per_month = 75 (plan + addon)
- [ ] Tenant 3: documents_per_month = 500 (override)
- [ ] In-memory plan lookup works (no DB query)
- [ ] Add-on merging works (numeric addition)
- [ ] Override precedence works (replaces plan)

### Entitlement Guard

- [ ] Boolean features enforced correctly
- [ ] Tiered text features enforced correctly
- [ ] Minimum value checks work
- [ ] Multiple requirements (AND logic) work
- [ ] Proper 403 errors with feature details
- [ ] Authenticated-only endpoints work (no guard)

### API Endpoints

- [ ] `GET /entitlements/plans` returns all plans
- [ ] `GET /entitlements/plans/:key` returns specific plan
- [ ] `GET /entitlements/current` returns tenant entitlements
- [ ] All mock endpoints respond correctly
- [ ] Swagger docs accessible at `/docs`

---

## Common Issues & Troubleshooting

### Issue 1: Sync Service Doesn't Run

**Symptom:** No sync logs on startup, empty features/plans tables

**Solution:**

- Check `EntitlementsModule` is imported in `AppModule`
- Check `EntitlementSyncService` implements `OnModuleInit`
- Check database connection is established before sync

### Issue 2: Add-on Merging Returns Wrong Value

**Symptom:** Tenant 2 shows 25 documents instead of 75

**Solution:**

- Verify add-on seed ran: `SELECT * FROM tenant_addons WHERE tenant_id = '22222222-...'`
- Verify addon_entitlements exist: `SELECT * FROM addon_entitlements`
- Check `TenantAddonsRepository.findActiveByTenantWithEntitlements()` returns data
- Check `EntitlementResolverService.merge()` logic

### Issue 3: Override Not Applied

**Symptom:** Tenant 3 shows -1 documents instead of 500

**Solution:**

- Verify override seed ran: `SELECT * FROM tenant_overrides WHERE tenant_id = '33333333-...'`
- Check `is_active = true` and `expires_at > now()`
- Check `TenantOverridesRepository.findActiveByTenant()` returns data
- Check merge logic gives override highest precedence

### Issue 4: EntitlementGuard Always Fails

**Symptom:** All requests return 401 Unauthorized

**Solution:**

- Verify tenant token is valid
- Check `request.auth.tenant` is populated (see Bug 3 fix)
- Verify `@AuthOptions({ tenant: true })` is set on controller

### Issue 5: Wrong Plan Entitlements

**Symptom:** Tenant shows wrong feature values

**Solution:**

- Verify `tenants.plan` column matches expected value
- Check `PLAN_ENTITLEMENTS` constant has correct values
- Verify sync service ran successfully
- Check `plan_entitlements` table has 60 rows

---

## Next Steps After Testing

Once all tests pass:

1. **Document findings** in implementation summary
2. **Fix any bugs** discovered during testing
3. **Decide on Phase 3** implementation:
   - Usage ingestion service
   - Usage enforcement guard
   - Projection updates
4. **Update API documentation** with entitlement patterns
5. **Create E2E test suite** (optional but recommended)

---

## Quick Test Script

Save this as `test-entitlements.sh` for rapid testing:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000/api"

echo "=== Testing Entitlement System ==="

# Test 1: List plans (no auth)
echo -e "\n1. List all plans (no auth)..."
curl -s "$BASE_URL/entitlements/plans" | jq '.[] | {key, name, priceMonthly}'

# Test 2: Get shield plan
echo -e "\n2. Get shield plan details..."
curl -s "$BASE_URL/entitlements/plans/shield" | jq '{key, priceMonthly, entitlements: .entitlements | keys}'

# Add authenticated tests here after getting tokens...

echo -e "\n=== Tests Complete ==="
```

---

**Testing Priority:**

1. ✅ **High Priority:** Category 2 (tenant entitlements) - Core functionality
2. ✅ **High Priority:** Scenario 1 & 2 (add-on merging, override precedence) - Key features
3. ✅ **Medium Priority:** Category 3 (mock controller) - Guard enforcement
4. ✅ **Low Priority:** Category 4 (debug endpoints) - Troubleshooting

Start with the high-priority tests to validate the foundation!

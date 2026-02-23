# Entitlement System Documentation

**Version:** 1.0  
**Last Updated:** February 23, 2026  
**Status:** ✅ Implemented

---

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Architecture](#architecture)
- [Feature Catalog](#feature-catalog)
- [Plan Tiers](#plan-tiers)
- [How It Works](#how-it-works)
- [Usage Flows](#usage-flows)
- [API Integration](#api-integration)
- [Credit System](#credit-system)
- [Domain Events](#domain-events)
- [Add-on Management](#add-on-management)
- [Override Management (Platform Admin)](#override-management-platform-admin)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Entitlement System is a production-grade engine that manages what features tenants can access based on their subscription plan. It replaces the old flat `features` JSONB column with a layered, event-sourced architecture.

### What It Does

- **Resolves Entitlements:** Computes what a tenant can do based on plan + add-ons + overrides
- **Tracks Usage:** Records every feature use in an append-only ledger
- **Enforces Limits:** Blocks requests when quotas are exceeded
- **Credit Fallback:** Allows overage using credits (for creditable features)
- **Audit Trail:** Every action is recorded as a domain event for compliance

### Key Benefits

- ✅ **Type-Safe:** Features are strongly typed (boolean, quota, capacity, etc.)
- ✅ **Event-Sourced:** Full audit trail, replayable history
- ✅ **Scalable:** Snapshot caching for fast reads, async projections for writes
- ✅ **Flexible:** Supports plans, add-ons, promotional grants, admin overrides
- ✅ **Credit System:** Graceful degradation when limits are hit

---

## Core Concepts

### 1. Features

A **feature** is something a tenant can use. Each feature has a **type**:

| Type | Description | Example | Value Storage |
|------|-------------|---------|---------------|
| **boolean** | On/off access | `redlining_enabled` | `value_bool: true/false` |
| **quota** | Units per billing period | `documents_per_month: 25` | `value_int: 25` (-1 = unlimited) |
| **capacity** | Max concurrent resources | `user_seats: 10` | `value_int: 10` |
| **metered** | Per-usage tracking | Future: API calls | `value_int` |
| **rate_limit** | Time-based limit | Future: requests/min | `value_int` |

**Tiered Features:** Some features use `value_text` for tiers:
- `template_library: 'essential'` or `'full'`
- `bilingual_quality: 'standard'` or `'jais_native'`
- `data_isolation: 'shared'`, `'row_level'`, or `'silo'`

### 2. Plans

A **plan** is a subscription tier with predefined feature limits:

| Plan | Target Audience | Price | Key Features |
|------|----------------|-------|--------------|
| **Navigator** (Free) | Founders in idea phase | AED 0/mo | 3 docs/mo, basic regulatory |
| **Shield** | Solo entrepreneurs | AED 249/mo | 25 docs/mo, essential templates |
| **General Counsel** | Active SMEs | AED 599/mo | 100 docs/mo, full library, AI redlining |
| **Infrastructure** | Agencies, enterprises | AED 2,499+/mo | Unlimited docs, custom playbooks, white-label |

### 3. Effective Entitlement

The **effective entitlement** is what a tenant actually gets, computed as:

```
effective_entitlements = plan_entitlements + addon_entitlements + overrides
```

**Resolution Order:**
1. Start with plan's base entitlements
2. Add entitlements from active add-ons (stacking)
3. Apply admin overrides (highest precedence)

### 4. Usage Tracking

Every time a tenant uses a feature, a **usage event** is recorded:

```typescript
{
  tenant_id: "uuid",
  feature_key: "documents_per_month",
  units: 1,
  allocations: [
    { source: "plan", units: 1 }  // or "addon", "credit", "override"
  ],
  billing_period: "2026-02",
  recorded_at: "2026-02-07T10:30:00Z"
}
```

**Source Attribution:**
- `plan`: Used from plan quota
- `addon`: Used from add-on quota
- `credit`: Paid with credits (overage)
- `override`: Used from admin override

### 5. Credits

**Credits** are a fallback mechanism for **creditable features** (marked with `creditable: true`).

**How It Works:**
1. Tenant exceeds quota (e.g., 25 docs used, tries to create 26th)
2. System checks if feature is creditable
3. If yes, deducts credits based on feature's `credit_cost` (e.g., 5 credits per document)
4. Usage is recorded with `source: "credit"`

**Credit Cost Per Feature:**
- Each creditable feature has a `credit_cost` field defining credits per unit
- Example: `documents_per_month` costs 5 credits per document
- Example: `regulatory_queries_per_month` costs 3 credits per query
- Non-creditable features have `credit_cost: null`

**Credit Ledger:**
- Append-only transaction log
- Tracks purchases, grants, deductions, refunds
- Running balance computed from ledger
- Deduction events include `credit_cost_per_unit` and `units_consumed` for audit trail

---

## Architecture

### System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                   Request Flow                                │
├──────────────────────────────────────────────────────────────┤
│  1. HTTP Request → EntitlementGuard (check access)           │
│  2. Controller → Service → EntitlementEnforcementService     │
│  3. Resolve entitlement (snapshot cache or fresh compute)    │
│  4. Check usage vs limit                                     │
│  5. If exceeded → check credits → deduct if available        │
│  6. Record usage event (append-only ledger)                  │
│  7. Update aggregated projection (sync for now)              │
│  8. Emit domain event (audit trail)                          │
│  9. Return result to client                                  │
└──────────────────────────────────────────────────────────────┘
```

### Data Layer

```
┌─────────────────────────────────────────────────────────────┐
│                   Catalog Tables (Global)                    │
│  features, plans, plan_entitlements, addons                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Tenant-Scoped Tables (RLS)                      │
│  tenant_subscriptions, tenant_addons, tenant_overrides      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Event Ledgers (Append-Only, RLS)                  │
│  usage_ledger, usage_allocations, credit_ledger             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         Projections & Snapshots (Performance Cache)          │
│  aggregated_usage, entitlement_snapshots                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Domain Events (Audit Trail)                     │
│  domain_events (immutable event log)                        │
└─────────────────────────────────────────────────────────────┘
```

### Key Services

| Service | Responsibility |
|---------|----------------|
| **EntitlementResolverService** | Compute effective entitlements (plan + addons + overrides) |
| **EntitlementEnforcementService** | Runtime checks: can tenant use feature? Record usage + credit fallback |
| **EntitlementSnapshotService** | Cache computed entitlements for fast reads (24h TTL) |
| **UsageIngestionService** | Record usage events to append-only ledger |
| **UsageProjectionService** | Maintain aggregated usage counts (derived from ledger) |
| **CreditLedgerService** | Manage credit transactions (purchase, grant, deduct, refund) |
| **SubscriptionsService** | Manage tenant subscriptions (create, change plan, cancel, renew) |
| **DomainEventsService** | Emit and query domain events (audit trail) |

---

## Feature Catalog

### Complete Feature List

| Feature Key | Type | Unit | Creditable | Credit Cost | Description |
|-------------|------|------|------------|-------------|-------------|
| `documents_per_month` | quota | documents | ✅ Yes | 5 credits | Documents that can be generated per billing period |
| `template_library` | boolean | - | ❌ No | - | Access to template library (essential/full) |
| `bilingual_quality` | boolean | - | ❌ No | - | Bilingual quality (standard/jais_native) |
| `contract_reviews_per_month` | quota | reviews | ❌ No | - | AI contract reviews per billing period |
| `risk_analysis_level` | boolean | - | ❌ No | - | Risk analysis level (none/critical_only/full) |
| `redlining_enabled` | boolean | - | ❌ No | - | AI suggests alternative compliant wording |
| `localizer_check` | boolean | - | ❌ No | - | Flags governing law/jurisdiction mismatches |
| `regulatory_hub_access` | boolean | - | ❌ No | - | Access to compliance dashboard |
| `regulatory_queries_per_month` | quota | queries | ✅ Yes | 3 credits | Chat-with-Law queries per billing period |
| `license_verifier_lookups` | quota | lookups | ❌ No | - | DED API lookups per billing period |
| `jurisdictions` | boolean | - | ❌ No | - | Access to jurisdictions (single/all) |
| `user_seats` | capacity | seats | ❌ No | - | Maximum number of users in tenant |
| `data_isolation` | boolean | - | ❌ No | - | Data isolation level (shared/row_level/silo) |
| `custom_playbooks` | boolean | - | ❌ No | - | Upload company-specific negotiating positions |
| `white_label_exports` | boolean | - | ❌ No | - | Export reports with tenant branding |

---

## Plan Tiers

### Navigator (Free)

**Target:** Founders in idea phase  
**Price:** AED 0/month

| Feature | Value |
|---------|-------|
| Documents per month | 3 |
| Template library | essential |
| Bilingual quality | standard |
| Contract reviews | 0 |
| Risk analysis | none |
| Redlining | ❌ |
| Localizer check | ❌ |
| Regulatory hub | ✅ |
| Regulatory queries | 5/month |
| License lookups | 0 |
| Jurisdictions | single |
| User seats | 1 |
| Data isolation | shared |
| Custom playbooks | ❌ |
| White-label | ❌ |

### Shield

**Target:** Solo entrepreneurs (1-5 employees)  
**Price:** AED 249/month

| Feature | Value |
|---------|-------|
| Documents per month | 25 |
| Template library | essential |
| Bilingual quality | standard |
| Contract reviews | 5/month |
| Risk analysis | critical_only |
| Redlining | ❌ |
| Localizer check | ❌ |
| Regulatory hub | ✅ |
| Regulatory queries | 20/month |
| License lookups | 5/month |
| Jurisdictions | single |
| User seats | 3 |
| Data isolation | shared |
| Custom playbooks | ❌ |
| White-label | ❌ |

### General Counsel

**Target:** Active SMEs (5-50 employees)  
**Price:** AED 599/month

| Feature | Value |
|---------|-------|
| Documents per month | 100 |
| Template library | full |
| Bilingual quality | jais_native |
| Contract reviews | 30/month |
| Risk analysis | full |
| Redlining | ✅ |
| Localizer check | ✅ |
| Regulatory hub | ✅ |
| Regulatory queries | 100/month |
| License lookups | 20/month |
| Jurisdictions | all |
| User seats | 10 |
| Data isolation | row_level |
| Custom playbooks | ❌ |
| White-label | ❌ |

### Infrastructure

**Target:** Agencies, law firms, enterprises  
**Price:** AED 2,499+/month

| Feature | Value |
|---------|-------|
| Documents per month | **Unlimited** (-1) |
| Template library | full |
| Bilingual quality | jais_native |
| Contract reviews | **Unlimited** (-1) |
| Risk analysis | full |
| Redlining | ✅ |
| Localizer check | ✅ |
| Regulatory hub | ✅ |
| Regulatory queries | **Unlimited** (-1) |
| License lookups | **Unlimited** (-1) |
| Jurisdictions | all |
| User seats | **Unlimited** (-1) |
| Data isolation | silo |
| Custom playbooks | ✅ |
| White-label | ✅ |

---

## How It Works

### 1. Entitlement Resolution

**Cold Path (No Snapshot):**

```typescript
// EntitlementResolverService.resolveForTenant()
1. Check snapshot cache → MISS
2. Get tenant's active subscription → plan_id
3. Get plan entitlements from database
4. Get active add-ons for tenant
5. Get add-on entitlements from database
6. Get active overrides for tenant
7. Merge: plan + addons + overrides (overrides win)
8. Create snapshot (cache for 24h)
9. Return effective entitlements
```

**Hot Path (Snapshot Hit):**

```typescript
// EntitlementResolverService.resolveForTenant()
1. Check snapshot cache → HIT
2. Return cached entitlements (< 10ms)
```

**Snapshot Invalidation:**
- Plan change → invalidate immediately
- Add-on added/removed → invalidate immediately
- Override applied/expired → invalidate immediately
- Stale (> 24h) → auto-invalidate on next read

### 2. Usage Enforcement

**Example: Document Generation**

```typescript
// EntitlementEnforcementService.checkAndRecord()
1. Resolve entitlement for 'documents_per_month'
   → Result: { value_int: 25, source: 'plan', creditable: true }

2. Get current usage for billing period
   → Query aggregated_usage: total_units = 24

3. Check: remaining = 25 - 24 = 1 unit left
   → Request: 1 unit
   → Allowed: YES (within quota)

4. Record usage event:
   - tenant_id, feature_id, units: 1
   - allocations: [{ source: 'plan', units: 1 }]
   - billing_period: '2026-02'

5. Update aggregated_usage:
   - total_units: 24 → 25
   - plan_units: 24 → 25

6. Emit domain event: 'usage.recorded'

7. Return: { allowed: true, source: 'plan', remaining: 0 }
```

**Example: Quota Exceeded (Credit Fallback)**

```typescript
// EntitlementEnforcementService.checkAndRecord()
1. Resolve entitlement for 'documents_per_month'
   → Result: { value_int: 25, source: 'plan', creditable: true }

2. Get current usage
   → total_units = 25 (quota exhausted)

3. Check: remaining = 25 - 25 = 0
   → Request: 1 unit
   → Exceeded: YES

4. Check if creditable → YES

5. Get credit balance → 50 credits available

6. Calculate cost: 1 unit × 5 credits/unit = 5 credits (feature-specific cost)

7. Deduct credits:
   - Record credit transaction: -5 credits
   - balance_after: 45

8. Record usage event:
   - allocations: [{ source: 'credit', units: 1 }]
   - metadata: { credit_cost_per_unit: 5, total_credits_deducted: 5 }

9. Update aggregated_usage:
   - total_units: 25 → 26
   - credit_units: 0 → 1

10. Emit domain events:
    - 'usage.recorded' (includes credit cost in metadata)
    - 'credit.deducted' (includes credit_cost_per_unit: 5, units_consumed: 1)

11. Return: {
      allowed: true,
      source: 'credit',
      creditsRemaining: 45,
      creditsDeducted: 5,
      creditCostPerUnit: 5
    }
```

**Example: Partial Credit Fallback**

```typescript
// Scenario: Tenant has 2 units left in plan, requests 5 units
// Feature: documents_per_month (5 credits per document)
1. Resolve entitlement → value_int: 25
2. Current usage → 23 units used
3. Remaining: 25 - 23 = 2 units
4. Request: 5 units → exceeds by 3 units
5. Check credits → 20 credits available
6. Calculate credit cost: 3 units × 5 credits/unit = 15 credits
7. Split allocation:
   - Plan: 2 units (use what's left)
   - Credit: 3 units (fill the gap, costs 15 credits)
8. Deduct 15 credits
9. Record usage with allocations:
   [
     { source: 'plan', units: 2 },
     { source: 'credit', units: 3 }
   ]
   metadata: {
     credit_cost_per_unit: 5,
     total_credits_deducted: 15,
     plan_units: 2,
     credit_units: 3
   }
10. Return: {
     allowed: true,
     source: 'mixed',
     allocations: [...],
     creditsRemaining: 5,
     creditsDeducted: 15,
     creditCostPerUnit: 5
   }
```

### 3. Boolean Feature Check

```typescript
// Example: Check if redlining is enabled
@AuthOptions({ tenant: true })
@UseGuards(EntitlementGuard)
@RequireEntitlement('redlining_enabled')
async analyzeContract() {
  // Guard checks:
  // 1. Resolve entitlement for 'redlining_enabled'
  // 2. Check: value_bool === true
  // 3. If false → throw ForbiddenException
  // 4. If true → allow request
}
```

### 4. Tiered Feature Check

```typescript
// Example: Check if tenant has 'full' template library
@AuthOptions({ tenant: true })
@UseGuards(EntitlementGuard)
@RequireEntitlement({
  featureKey: 'template_library',
  value_text: 'full'
})
async listAllTemplates() {
  // Guard checks:
  // 1. Resolve entitlement for 'template_library'
  // 2. Check: value_text === 'full'
  // 3. If 'essential' → throw ForbiddenException
  // 4. If 'full' → allow request
}
```

---

## Usage Flows

### Flow 1: New Tenant Signup

```
1. User signs up → creates account
2. System creates tenant
3. System creates subscription:
   - plan_id: navigator (free)
   - status: active
   - current_period_start: now
   - current_period_end: now + 1 month
4. Snapshot is NOT created yet (lazy)
5. First API request triggers snapshot creation
```

### Flow 2: Plan Upgrade

```
1. Tenant admin clicks "Upgrade to Shield"
2. Frontend calls: POST /api/subscriptions/change-plan
   Body: { planKey: "shield" }
3. SubscriptionsService.changePlan():
   - Validate new plan exists
   - Update subscription.plan_id
   - Invalidate entitlement snapshot
   - Emit 'subscription.plan_changed' event
4. Next API request:
   - Snapshot cache MISS
   - Resolve fresh entitlements (Shield limits)
   - Create new snapshot
5. Tenant now has Shield entitlements
```

### Flow 3: Document Generation (Within Quota)

```
1. User clicks "Generate Document"
2. Frontend calls: POST /api/documents/generate
3. Controller has @TrackUsage('documents_per_month') decorator
4. EntitlementEnforcementService.checkAndRecord():
   - Resolve entitlement: 25 docs/month
   - Check usage: 10 used
   - Remaining: 15
   - Record usage: +1 doc
   - Update projection: 10 → 11
5. Document is generated
6. Response: { documentId, remaining: 14 }
```

### Flow 4: Document Generation (Quota Exceeded, Credits Used)

```
1. User clicks "Generate Document" (26th this month)
2. Frontend calls: POST /api/documents/generate
3. EntitlementEnforcementService.checkAndRecord():
   - Resolve entitlement: 25 docs/month, creditable: true, credit_cost: 5
   - Check usage: 25 used
   - Remaining: 0 → EXCEEDED
   - Check credits: 100 available
   - Deduct 5 credits: 100 → 95 (5 credits per document)
   - Record usage with source: 'credit'
   - Update projection: credit_units: 0 → 1
4. Document is generated
5. Response: {
     documentId,
     source: 'credit',
     creditsRemaining: 95,
     creditsDeducted: 5,
     creditCostPerUnit: 5,
     message: "Used 5 credits (quota exceeded)"
   }
```

### Flow 5: Document Generation (Quota Exceeded, No Credits)

```
1. User clicks "Generate Document" (26th this month)
2. Frontend calls: POST /api/documents/generate
3. EntitlementEnforcementService.checkAndRecord():
   - Resolve entitlement: 25 docs/month, creditable: true
   - Check usage: 25 used
   - Remaining: 0 → EXCEEDED
   - Check credits: 0 available
   - Emit 'entitlement.denied' event
4. Throw ForbiddenException
5. Response: 402 Payment Required
   {
     statusCode: 402,
     message: "Document quota exceeded",
     limit: 25,
     used: 25,
     creditsRemaining: 0,
     upgradeUrl: "/billing/upgrade"
   }
```

### Flow 6: Boolean Feature Access Denied

```
1. User (Shield plan) clicks "Enable AI Redlining"
2. Frontend calls: POST /api/contracts/analyze
   (Endpoint has @RequireEntitlement('redlining_enabled'))
3. EntitlementGuard.canActivate():
   - Resolve entitlement: redlining_enabled
   - Result: { value_bool: false, source: 'plan' }
   - Check: value_bool === true? NO
4. Throw ForbiddenException
5. Response: 403 Forbidden
   {
     statusCode: 403,
     message: "Your plan does not include this feature",
     feature: "redlining_enabled",
     required: "redlining_enabled must be true",
     current: "false",
     upgradeUrl: "/billing/upgrade"
   }
```

### Flow 7: Credit Purchase

```
1. Tenant admin clicks "Buy 100 Credits"
2. Payment processed externally (Stripe/etc)
3. Webhook calls: POST /api/credits/purchase
   Body: { tenantId, amount: 100, paymentRef: "pi_xxx" }
4. CreditLedgerService.purchase():
   - Get current balance: 50
   - Record transaction:
     - type: 'purchase'
     - amount: +100
     - balance_after: 150
   - Emit 'credit.purchased' event
5. Response: { balance: 150, transaction_id }
```

### Flow 8: Admin Credit Grant

```
1. System admin grants 50 credits to tenant (compensation)
2. Admin calls: POST /api/admin/credits/grant
   Body: {
     tenantId,
     amount: 50,
     reason: "Compensation for downtime"
   }
3. CreditLedgerService.grant():
   - Get current balance: 150
   - Record transaction:
     - type: 'grant'
     - amount: +50
     - balance_after: 200
     - reason: "Compensation for downtime"
     - applied_by: admin_user_id
   - Emit 'credit.granted' event
4. Response: { balance: 200, transaction_id }
```

### Flow 9: Billing Period Renewal

```
1. Scheduled job runs daily at midnight (BullMQ cron)
2. Job calls: SubscriptionsService.renewAllDuePeriods()
3. For each subscription where current_period_end <= now:
   - Update current_period_start = old current_period_end
   - Update current_period_end = +1 month
   - Emit 'subscription.renewed' event
4. Next usage request:
   - Derives billing_period from new current_period_start
   - Usage is tracked against new period
   - Old period's aggregated_usage remains for history
```

---

## API Integration

### Using EntitlementGuard (Boolean Features)

```typescript
import { EntitlementGuard } from '@common/guards/entitlement.guard';
import { RequireEntitlement } from '@common/decorators/require-entitlement.decorator';

@Controller('contracts')
export class ContractsController {
  
  // Simple boolean check
  @Post('analyze')
  @AuthOptions({ tenant: true })
  @UseGuards(EntitlementGuard)
  @RequireEntitlement('redlining_enabled')
  async analyzeContract(@CurrentUserTenant() tenant) {
    // Only executes if tenant has redlining_enabled = true
    return this.contractsService.analyze(tenant.tenantId);
  }
  
  // Tiered feature check
  @Get('templates/all')
  @AuthOptions({ tenant: true })
  @UseGuards(EntitlementGuard)
  @RequireEntitlement({
    featureKey: 'template_library',
    value_text: 'full'
  })
  async listAllTemplates() {
    // Only executes if tenant has template_library = 'full'
    return this.templatesService.findAll();
  }
  
  // Multiple requirements (AND logic)
  @Post('advanced-analysis')
  @AuthOptions({ tenant: true })
  @UseGuards(EntitlementGuard)
  @RequireEntitlement('redlining_enabled', 'localizer_check')
  async advancedAnalysis() {
    // Only executes if BOTH features are enabled
    return this.contractsService.advancedAnalysis();
  }
  
  // Minimum value check (capacity)
  @Post('team/invite')
  @AuthOptions({ tenant: true })
  @UseGuards(EntitlementGuard)
  @RequireEntitlement({
    featureKey: 'user_seats',
    minValue: 2
  })
  async inviteTeamMember() {
    // Only executes if tenant has >= 2 user seats
    return this.teamsService.invite();
  }
}
```

### Using EntitlementEnforcementService (Quota Features)

```typescript
import { EntitlementEnforcementService } from '@modules/entitlements/services/entitlement-enforcement.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly enforcementService: EntitlementEnforcementService,
  ) {}
  
  async generateDocument(tenantId: string, userId: string, data: any) {
    // Check and record usage
    const checkResult = await this.enforcementService.checkAndRecord(
      tenantId,
      'documents_per_month',
      userId,
      1, // units
      { document_type: data.type } // metadata
    );
    
    if (!checkResult.allowed) {
      // Quota exceeded, no credits
      throw new PaymentRequiredException({
        message: 'Document quota exceeded',
        limit: checkResult.limit,
        used: checkResult.used,
        creditsRemaining: checkResult.creditsRemaining,
      });
    }
    
    // Generate document
    const document = await this.createDocument(data);
    
    // Return with usage info
    return {
      document,
      usage: {
        source: checkResult.source, // 'plan', 'credit', or 'mixed'
        remaining: checkResult.remaining,
        creditsRemaining: checkResult.creditsRemaining,
      }
    };
  }
}
```

### Querying Current Entitlements

```typescript
import { EntitlementResolverService } from '@modules/entitlements/services/entitlement-resolver.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly resolver: EntitlementResolverService,
  ) {}
  
  async getCurrentPlanDetails(tenantId: string) {
    // Get all entitlements for tenant
    const result = await this.resolver.resolveAllForTenant(tenantId);
    
    return {
      plan: result.plan, // 'shield', 'general_counsel', etc.
      entitlements: result.entitlements, // Map of feature_key -> entitlement
      // Example:
      // {
      //   documents_per_month: {
      //     feature_type: 'quota',
      //     value_int: 25,
      //     source: 'plan'
      //   },
      //   redlining_enabled: {
      //     feature_type: 'boolean',
      //     value_bool: false,
      //     source: 'plan'
      //   }
      // }
    };
  }
}
```

### Querying Usage

```typescript
import { UsageProjectionService } from '@modules/entitlements/services/usage-projection.service';

@Injectable()
export class UsageService {
  constructor(
    private readonly projectionService: UsageProjectionService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}
  
  async getCurrentUsage(tenantId: string, featureKey: FeatureKey) {
    // Get active subscription
    const subscription = await this.subscriptionsRepository.findActiveByTenant(tenantId);
    
    // Get current usage
    const usage = await this.projectionService.getCurrentUsage(
      tenantId,
      subscription.id,
      featureKey
    );
    
    return {
      total_units: usage.total_units,
      plan_units: usage.plan_units,
      addon_units: usage.addon_units,
      credit_units: usage.credit_units,
      billing_period: usage.billing_period,
    };
  }
}
```

---

## Credit System

### Credit Balance

```typescript
import { CreditLedgerService } from '@modules/entitlements/services/credit-ledger.service';

@Injectable()
export class CreditsController {
  constructor(
    private readonly creditLedger: CreditLedgerService,
  ) {}
  
  @Get('balance')
  @AuthOptions({ tenant: true })
  async getBalance(@CurrentUserTenant() tenant) {
    const balance = await this.creditLedger.getBalance(tenant.tenantId);
    return { balance };
  }
}
```

### Credit Transactions

```typescript
@Get('transactions')
@AuthOptions({ tenant: true })
async getTransactions(
  @CurrentUserTenant() tenant,
  @Query('limit') limit = 50,
  @Query('cursor') cursor?: string,
) {
  const transactions = await this.creditLedger.getTransactionHistory(
    tenant.tenantId,
    limit,
    cursor
  );
  
  return {
    transactions, // Array of credit transactions
    // Each transaction has:
    // - id, transaction_type, amount, balance_after
    // - feature_id (if deduction), usage_ledger_id (if deduction)
    // - reason, applied_by, expires_at, recorded_at
  };
}
```

### Credit Purchase (Admin)

```typescript
@Post('purchase')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('entitlements:manage')
async purchaseCredits(
  @Body() dto: PurchaseCreditsDto,
) {
  const transaction = await this.creditLedger.purchase(
    dto.tenantId,
    dto.amount,
    { payment_reference: dto.paymentRef }
  );
  
  return {
    transaction_id: transaction.id,
    balance: transaction.balance_after,
  };
}
```

### Credit Grant (Admin)

```typescript
@Post('grant')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('entitlements:manage')
async grantCredits(
  @Body() dto: GrantCreditsDto,
  @CurrentUserIdentity() admin,
) {
  const transaction = await this.creditLedger.grant(
    dto.tenantId,
    dto.amount,
    dto.reason,
    dto.expiresAt, // optional
    admin.userId
  );
  
  return {
    transaction_id: transaction.id,
    balance: transaction.balance_after,
  };
}
```

---

## Domain Events

### Event Types

| Event Type | Aggregate | Description |
|------------|-----------|-------------|
| `usage.recorded` | usage | Usage event appended to ledger |
| `credit.purchased` | credit | Credits purchased |
| `credit.granted` | credit | Credits granted (promo/admin) |
| `credit.deducted` | credit | Credits used for overage |
| `credit.refunded` | credit | Credits refunded |
| `credit.expired` | credit | Credits expired |
| `entitlement.denied` | entitlement | Feature access denied (quota exceeded, no credits) |
| `entitlement.snapshot_created` | entitlement | Snapshot created |
| `entitlement.snapshot_invalidated` | entitlement | Snapshot invalidated |
| `subscription.created` | subscription | New subscription created |
| `subscription.plan_changed` | subscription | Plan upgraded/downgraded |
| `subscription.cancelled` | subscription | Subscription cancelled |
| `subscription.renewed` | subscription | Billing period renewed |

### Querying Events

```typescript
import { DomainEventsService } from '@modules/entitlements/services/domain-events.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly domainEvents: DomainEventsService,
  ) {}
  
  // Get all events for a tenant
  async getTenantAuditTrail(tenantId: string, filters?: DomainEventFilters) {
    return this.domainEvents.getEventsByTenant(tenantId, filters);
    // filters: { eventType, aggregateType, fromDate, toDate, limit, offset }
  }
  
  // Get events for a specific aggregate (e.g., a usage event)
  async getResourceAuditTrail(aggregateType: string, aggregateId: string) {
    return this.domainEvents.getEventsByAggregate(aggregateType, aggregateId);
  }
  
  // Get events by type
  async getCreditDeductions(tenantId: string) {
    return this.domainEvents.getEventsByType('credit.deducted', tenantId);
  }
  
  // Event replay (for debugging/reconstruction)
  async replayEvents(tenantId: string, fromDate?: Date) {
    return this.domainEvents.replayEvents(tenantId, fromDate);
  }
}
```

### Event Payload Examples

**usage.recorded:**
```json
{
  "event_type": "usage.recorded",
  "tenant_id": "uuid",
  "aggregate_type": "usage",
  "aggregate_id": "usage_event_id",
  "actor_id": "user_id",
  "payload": {
    "usage_event_id": "uuid",
    "feature_id": "uuid",
    "feature_key": "documents_per_month",
    "feature_name": "Documents Per Month",
    "feature_type": "quota",
    "units": 1,
    "allocations": [
      { "source": "plan", "units": 1 }
    ],
    "billing_period": "2026-02",
    "resource_type": "document",
    "resource_id": "document_uuid"
  },
  "recorded_at": "2026-02-07T10:30:00Z"
}
```

**credit.deducted:**
```json
{
  "event_type": "credit.deducted",
  "tenant_id": "uuid",
  "aggregate_type": "credit",
  "aggregate_id": "credit_transaction_id",
  "actor_id": "user_id",
  "payload": {
    "transaction_id": "uuid",
    "transaction_type": "deduction",
    "amount": -5,
    "balance_after": 45,
    "feature_id": "uuid",
    "usage_ledger_id": "uuid",
    "reason": null,
    "credit_cost_per_unit": 5,
    "units_consumed": 1
  },
  "metadata": {
    "recorded_at": "2026-02-07T10:30:01Z",
    "credit_fallback": true,
    "credit_cost_per_unit": 5,
    "units_consumed": 1
  }
}
```

**subscription.plan_changed:**
```json
{
  "event_type": "subscription.plan_changed",
  "tenant_id": "uuid",
  "aggregate_type": "subscription",
  "aggregate_id": "subscription_id",
  "actor_id": "admin_user_id",
  "payload": {
    "old_plan_id": "uuid",
    "old_plan_key": "shield",
    "new_plan_id": "uuid",
    "new_plan_key": "general_counsel"
  },
  "recorded_at": "2026-02-07T10:00:00Z"
}
```

---

## Add-on Management

Add-ons are purchasable feature bundles that extend a tenant's entitlements beyond their base plan.

### Add-on Catalog (Public)

**Endpoint:** `GET /api/addons`  
**Authentication:** None (public catalog)

Browse available add-ons that can be purchased:

```typescript
// Response
[
  {
    id: "uuid",
    key: "extra_documents_pack",
    name: "Extra Documents Pack",
    description: "Add 50 additional documents per month",
    priceMonthly: 99.00,
    priceCurrency: "AED",
    isActive: true
  }
]
```

**Endpoint:** `GET /api/addons/:key`  
**Authentication:** None (public catalog)

Get detailed add-on information with entitlements:

```typescript
// Response
{
  id: "uuid",
  key: "extra_documents_pack",
  name: "Extra Documents Pack",
  description: "Add 50 additional documents per month",
  priceMonthly: 99.00,
  priceCurrency: "AED",
  isActive: true,
  entitlements: [
    {
      featureKey: "documents_per_month",
      featureType: "quota",
      valueInt: 50
    }
  ]
}
```

### Tenant Add-on Management

**Endpoint:** `GET /api/tenants/addons`  
**Authentication:** Tenant token  
**Permission:** Any tenant member (read-only)

List tenant's active add-ons:

```typescript
// Response
[
  {
    id: "uuid",
    addonKey: "extra_documents_pack",
    addonName: "Extra Documents Pack",
    quantity: 2,
    status: "active",
    startsAt: "2026-02-01T00:00:00Z",
    expiresAt: "2026-03-01T00:00:00Z",
    entitlements: [
      {
        featureKey: "documents_per_month",
        featureType: "quota",
        valueInt: 100  // 50 × 2 quantity
      }
    ],
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z"
  }
]
```

**Endpoint:** `POST /api/tenants/addons`  
**Authentication:** Tenant token  
**Permission:** `billing:manage`

Add an add-on to tenant subscription:

```typescript
// Request
{
  addonKey: "extra_documents_pack",
  quantity: 2  // optional, defaults to 1
}

// Response - same as list item above
```

**Endpoint:** `PATCH /api/tenants/addons/:id`  
**Authentication:** Tenant token  
**Permission:** `billing:manage`

Update add-on quantity or status:

```typescript
// Request
{
  quantity: 3,  // optional
  status: "cancelled"  // optional: active, cancelled, expired
}

// Response - updated add-on with entitlements
```

**Endpoint:** `DELETE /api/tenants/addons/:id`  
**Authentication:** Tenant token  
**Permission:** `billing:manage`

Cancel/remove add-on:

```typescript
// Response
{
  message: "Add-on removed successfully"
}
```

---

## Override Management (Platform Admin)

Overrides are admin-applied entitlement modifications for special cases (e.g., promotional grants, customer accommodations).

**Endpoint:** `GET /api/admin/tenants/:tenantId/overrides`  
**Authentication:** Identity token  
**Permission:** `entitlements:manage` (Platform)

List all overrides for a tenant:

```typescript
// Response
[
  {
    id: "uuid",
    featureKey: "documents_per_month",
    featureType: "quota",
    valueInt: 500,
    reason: "Special customer agreement - Q1 2024 promotion",
    appliedBy: "admin_user_id",
    startsAt: "2026-02-01T00:00:00Z",
    expiresAt: "2026-12-31T23:59:59Z",
    isActive: true,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z"
  }
]
```

**Endpoint:** `POST /api/admin/tenants/:tenantId/overrides`  
**Authentication:** Identity token  
**Permission:** `entitlements:manage` (Platform)

Apply an override:

```typescript
// Request - Exactly one value field required
{
  featureKey: "documents_per_month",
  valueInt: 500,  // For quota/capacity features
  // valueBool: true,  // For boolean features
  // valueText: "premium",  // For tiered features
  reason: "Special customer agreement - Q1 2024 promotion",
  expiresAt: "2026-12-31T23:59:59Z"  // optional
}

// Response - same as list item above
```

**Validation Rules:**
- Exactly one of `valueBool`, `valueInt`, or `valueText` must be provided
- `reason` is required (audit trail)
- `expiresAt` is optional (NULL = permanent override)

**Endpoint:** `PATCH /api/admin/tenants/:tenantId/overrides/:id`  
**Authentication:** Identity token  
**Permission:** `entitlements:manage` (Platform)

Update an existing override:

```typescript
// Request - At most one value field, or update reason/expiry only
{
  valueInt: 1000,  // optional - change the value
  reason: "Extended per customer request",  // optional
  expiresAt: "2027-06-30T23:59:59Z"  // optional
}

// Response - updated override
```

**Important:** When updating a value field (e.g., changing from `valueBool` to `valueInt`), provide the new field. The system automatically nulls the other value fields to satisfy the database constraint requiring exactly one value field.

**Endpoint:** `DELETE /api/admin/tenants/:tenantId/overrides/:id`  
**Authentication:** Identity token  
**Permission:** `entitlements:manage` (Platform)

Revoke (deactivate) an override:

```typescript
// Response - revoked override with is_active: false
```

---

## Troubleshooting

### Issue: Entitlements Not Updating After Plan Change

**Symptom:** Tenant upgraded to General Counsel but still sees Shield limits.

**Cause:** Stale snapshot cache.

**Solution:**
```typescript
// Force snapshot invalidation
await entitlementSnapshotService.invalidate(tenantId, 'manual_fix');

// Or rebuild snapshot
const entitlements = await entitlementResolver.resolveAllForTenant(tenantId);
await entitlementSnapshotService.rebuild(tenantId, entitlements, planKey);
```

### Issue: Usage Count Incorrect

**Symptom:** Aggregated usage shows 30 docs but ledger has 25 events.

**Cause:** Projection drift (rare, but possible if projection update fails).

**Solution:**
```typescript
// Rebuild projection from ledger (source of truth)
await usageProjectionService.rebuildFromLedger(
  tenantId,
  subscriptionId,
  featureKey,
  billingPeriod
);
```

### Issue: Credits Not Deducted

**Symptom:** Tenant exceeded quota, has credits, but request was denied.

**Cause:** Feature is not marked as `creditable` or `credit_cost` is not set.

**Solution:**
```typescript
// Check feature definition
const feature = getFeatureDefinition('feature_key');
console.log(feature.creditable); // Should be true
console.log(feature.credit_cost); // Should be a positive number

// If false or missing, update in plan-entitlements.constant.ts:
{
  key: 'feature_key',
  creditable: true, // ← Add this
  credit_cost: 5, // ← Add this (credits per unit)
}
```

### Issue: Billing Period Not Advancing

**Symptom:** Still tracking usage against old billing period.

**Cause:** Subscription renewal job not running or failed.

**Solution:**
```typescript
// Manual renewal
await subscriptionsService.renewPeriod(tenantId);

// Or batch renewal for all due subscriptions
await subscriptionsService.renewAllDuePeriods();
```

### Issue: Domain Events Not Appearing

**Symptom:** No events in domain_events table.

**Cause:** Event emission failed or transaction rolled back.

**Solution:**
```typescript
// Check if events are being emitted
const events = await domainEventsService.getEventsByTenant(tenantId);
console.log(events.length);

// If 0, check logs for errors during event emission
// Events are emitted within the same transaction as the operation,
// so if the operation fails, events won't be persisted.
```

### Issue: Concurrent Usage Race Condition

**Symptom:** Two requests at the same time, both succeed, but quota is exceeded.

**Cause:** Race condition on aggregated_usage update.

**Solution:**
- The system uses `SELECT ... FOR UPDATE` on aggregated_usage row within transaction
- If still occurring, check that all usage recording goes through EntitlementEnforcementService
- Never bypass the enforcement service and record usage directly

---

## Next Steps

### For Developers

1. **Read the code:**
   - `apps/api/src/modules/entitlements/` - Core services
   - `apps/api/src/common/constants/plan-entitlements.constant.ts` - Feature catalog
   - `apps/api/src/common/guards/entitlement.guard.ts` - Guard implementation

2. **Add a new feature:**
   - Add to `ALL_FEATURES` array
   - Add to `PLAN_ENTITLEMENTS` matrix
   - Restart app (EntitlementSyncService syncs to DB)

3. **Add a new plan:**
   - Add to `ALL_PLANS` array
   - Add entitlements to `PLAN_ENTITLEMENTS`
   - Restart app

4. **Integrate into your endpoint:**
   - Boolean features → Use `@RequireEntitlement()` + `EntitlementGuard`
   - Quota features → Call `EntitlementEnforcementService.checkAndRecord()`

### For Product/Business

1. **Monitor usage:**
   - Query `aggregated_usage` table for current period stats
   - Query `domain_events` for audit trail

2. **Adjust limits:**
   - Update `PLAN_ENTITLEMENTS` in code
   - Deploy (no migration needed)

3. **Grant promotional credits:**
   - Use admin endpoint: `POST /api/admin/credits/grant`

4. **View tenant entitlements:**
   - Use endpoint: `GET /api/entitlements/current`

---

## Related Documentation

- [DATABASE.md](./DATABASE.md) - Database schema for entitlement tables
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [API_CONTRACTS.md](./API_CONTRACTS.md) - API endpoint specifications

---

**Questions?** Check the code comments or ask the team!

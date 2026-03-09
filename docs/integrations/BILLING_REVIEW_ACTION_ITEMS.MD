# Billing & Stripe System — Review Action Items

Consolidated action items from the comprehensive billing system review.

**Date:** 2026-03-09
**Status:** Pre-production

---

## Priority Legend

| Priority | Meaning                                            |
| -------- | -------------------------------------------------- |
| **P0**   | Fix immediately — correctness bug                  |
| **P1**   | Fix before launch — revenue or reliability risk    |
| **P2**   | Fix soon — operational health                      |
| **P3**   | Nice to have — future-proofing and maintainability |

---

## Architecture

### ✅ DONE — Issue 2: Plan identity split (`tenants.plan` vs `tenant_subscriptions.plan_id`)

**Priority:** P0
**Status:** Completed
**What was done:** Eliminated `tenants.plan` entirely. Entitlement resolver now derives the plan from `tenant_subscriptions` JOINed with `plans` table. Removed the `plan` column from the `tenants` table, the `tenant_plan` ENUM, the Tenant entity, repository types, CreateTenantDto, TenantInfoResponseDto, seeds, and migration.

**Files changed:**

- `scripts/migrations/001_core_tables.sql` — dropped `plan` column and `tenant_plan` ENUM
- `scripts/migrations/009_entitlement_tables.sql` — updated comment
- `scripts/seeds/004_seed_test_tenants_users.sql` — removed `plan` from INSERT
- `scripts/seeds/006_seed_test_documents.sql` — removed `t.plan` reference
- `apps/api/src/modules/tenants/entities/tenant.entity.ts` — removed `plan` field
- `apps/api/src/repositories/tenants/tenant.repository.ts` — removed `plan` from all types, mapRow, getSelectColumns
- `apps/api/src/modules/tenants/dto/create-tenant.dto.ts` — removed `plan` field
- `apps/api/src/modules/tenants/tenant.service.ts` — removed `plan` from tenant creation
- `apps/api/src/modules/entitlements/services/entitlement-resolver.service.ts` — reads plan from subscription instead of tenant
- `apps/api/src/modules/entitlements/entitlements.module.ts` — removed TenantRepository provider
- `apps/api/src/modules/users/dto/user-response.dto.ts` — removed `plan` from TenantInfoResponseDto

---

### ✅ DONE — Issue 1: No automatic Stripe ↔ DB reconciliation

**Priority:** P2
**Status:** Completed
**What was done:** Added `BillingSchedulerService` that schedules a daily BullMQ cron job to run `StripeReconciliationService.reconcileAll()` at 3 AM. The job is automatically enabled in production and can be enabled in development via `BILLING_SCHEDULE_ENABLED=true`. Added manual testing endpoint for verification.

**Files changed:**
- `apps/api/src/modules/billing/services/billing-scheduler.service.ts` — New scheduled job service
- `apps/api/src/modules/billing/billing.module.ts` — Added scheduler service and StripeModule import
- `apps/api/src/config/env.schema.ts` — Added `BILLING_SCHEDULE_ENABLED` environment variable
- `apps/api/.env.example` — Documented new environment variable
- `apps/api/src/modules/mock/queue-test-mock.controller.ts` — Added manual test endpoint
- `apps/api/src/modules/billing/README.md` — Added documentation
- `infra/modules/secrets/main.tf` — Added `BILLING_SCHEDULE_ENABLED` to secrets
- `infra/modules/secrets/variables.tf` — Added billing schedule variable definition
- `infra/modules/ecs/services.tf` — Added environment variable to ECS services
- `infra/environments/staging/main.tf` — Pass variable to secrets module
- `infra/environments/staging/variables.tf` — Added staging variable definition
- `infra/environments/staging/terraform.tfvars.example` — Added example configuration
- `infra/environments/production/terraform.tfvars.example` — Added example configuration

---

### Issue 3: No dunning automation (failed payment recovery) ✅ COMPLETED

**Priority:** P1
**Decision:** Email dunning sequence via BullMQ
**Status:** ✅ **COMPLETED** in commit `05e3bd9` (2026-03-09)
**Implementation:** Complete automated dunning system with:
- Day 0 (immediate), Day 3, Day 5 email sequence via BullMQ
- AWS SES integration with multi-language templates (EN/AR)
- Subscription status `past_due` support for UI banners
- Terraform infrastructure with SES domain identity and IAM policies
**Key files:**

- ✅ `apps/api/src/modules/stripe/webhook/stripe-event-handlers/index.ts` (queueDunningEmailSequence method)
- ✅ `apps/api/src/modules/billing/processors/dunning-job.processor.ts` (job processor)
- ✅ `apps/api/src/modules/billing/handlers/dunning-email.handler.ts` (email handler)
- ✅ `apps/api/src/modules/email/email.service.ts` (SES integration + templates)
- ✅ `libs/queue/src/interfaces/billing-processing.jobs.ts` (job types)
- ✅ `infra/modules/ses/` (Terraform SES infrastructure)

---

### Issue 4: Catalog sync runs on every server startup

**Priority:** P3
**Decision:** Move to CLI command / admin endpoint
**What to do:** Convert `StripeCatalogSyncService.onModuleInit()` to an explicit command (e.g., `pnpm stripe:sync`) or use the existing admin controller. Remove `OnModuleInit` so the app doesn't sync on every restart. Keep `STRIPE_CATALOG_SYNC_ENABLED` as a guard but trigger manually.
**Effort:** ~2 hours
**Key files:**

- `apps/api/src/modules/stripe/services/stripe-catalog-sync.service.ts`

---

## Code Quality

### Issue 5: Add-on sync logic duplicated (webhook + reconciliation) ✅

**Priority:** P2
**Decision:** Extract shared `AddonSyncEngine`
**Status:** COMPLETED
**What was done:** Created a shared `AddonSyncEngine` service that provides:
- `analyzeSync()` - Pure analysis of Stripe vs DB state, returns mutations
- `executeMutations()` - Applies mutations to database with detailed logging  
- `syncAddons()` - Convenience method combining analysis + execution

Both webhook handler and reconciliation service now use the shared engine, eliminating ~200 lines of duplicated code.

**Files changed:**
- **NEW:** `apps/api/src/modules/stripe/services/addon-sync-engine.service.ts` - Shared sync engine
- `apps/api/src/modules/stripe/webhook/stripe-event-handlers/index.ts` - Uses shared engine
- `apps/api/src/modules/stripe/services/stripe-reconciliation.service.ts` - Uses shared engine  
- `apps/api/src/modules/stripe/stripe.module.ts` - Registers AddonSyncEngine provider

**Benefits:**
- Single source of truth for addon sync logic
- Consistent behavior between webhook and reconciliation
- Better testability (engine can be unit tested independently)
- Easier maintenance and bug fixes

---

### ✅ DONE (Quick Fix) — Issue 6: StripeModule imports SubscriptionsService directly

**Priority:** P1 (quick fix)
**Status:** Quick fix completed
**What was done:** Fixed encapsulation violation by importing `SubscriptionsModule` instead of directly providing `SubscriptionsService`. Removed `SubscriptionsService` from providers array and added `SubscriptionsModule` to imports array.

**Files changed:**
- `apps/api/src/modules/stripe/stripe.module.ts` — Fixed module imports and dependency injection

**Remaining work:**
- **Full refactor (P3, 4 hours):** Split into `StripeWebhookModule`, `StripeBillingModule`, `StripeCatalogModule`, `StripeAdminModule`. Remove `@Global()`.

---

### Issue 7: Currency (AED) hardcoded in 6+ locations

**Priority:** P3
**Decision:** Extract to config/constants, don't over-engineer
**What to do:** Move `price_currency` and the annual discount multiplier to a single billing constants file. Replace all hardcoded `'aed'` / `'AED'` / `price_aed` references to use the constant.
**Effort:** ~2 hours
**Key files:**

- `apps/api/src/common/constants/plan-entitlements.constant.ts`
- `apps/api/src/common/constants/credit-packages.constant.ts`
- `apps/api/src/modules/stripe/services/stripe-catalog-sync.service.ts`
- `apps/api/src/modules/stripe/controllers/billing.controller.ts`

---

### ✅ DONE — Issue 8: Stripe API version workarounds scattered across files

**Priority:** P1
**Status:** Completed
**What was done:** Created centralized `getSubscriptionPeriod()` utility function in `stripe.utils.ts` that handles Stripe API 2026-02-25 change where `current_period_start/end` moved from subscription root to `items.data[0]`. Replaced 4+ inline fallback patterns across webhook handlers, subscription service, and reconciliation service.

**Files changed:**
- `apps/api/src/modules/stripe/stripe.utils.ts` — Added `getSubscriptionPeriod()` utility function
- `apps/api/src/modules/stripe/webhook/stripe-event-handlers/index.ts` — Replaced 3 inline patterns
- `apps/api/src/modules/stripe/services/stripe-subscription.service.ts` — Replaced 2 inline patterns  
- `apps/api/src/modules/stripe/services/stripe-reconciliation.service.ts` — Replaced 1 inline pattern

---

## Testing

### Issues 9-12: Zero test coverage on billing system

**Priority:** P1 (when ready for launch)
**Decision:** Flagged for later — priority order agreed upon
**Recommended attack order:**

1. **Webhook handlers (Issue 9)** — highest blast radius, 2-3 days
   - `handleCheckoutCompleted` (subscription + credit purchase paths)
   - `handleSubscriptionChange` (create/update/delete)
   - `handleInvoicePaid`, `handleInvoicePaymentFailed`
   - Idempotency: same event ID → no-op
   - Key file: `apps/api/src/modules/stripe/webhook/stripe-event-handlers/index.ts`

2. **Entitlement enforcement (Issue 10)** — revenue protection, 2-3 days
   - Async path, strict path (CAS), unlimited path
   - Credit fallback: sufficient credits, insufficient credits, non-creditable
   - Concurrent request handling
   - Key file: `apps/api/src/modules/entitlements/services/entitlement-enforcement.service.ts`

3. **Catalog sync (Issue 12)** — pricing integrity, 1 day
   - AED to fils conversion
   - Annual pricing formula (monthly × 10)
   - Idempotency: product exists → update not create
   - Key file: `apps/api/src/modules/stripe/services/stripe-catalog-sync.service.ts`

4. **Reconciliation (Issue 11)** — safety net, 1-2 days
   - Status/period/plan drift detection
   - Add-on drift: create, reactivate, quantity update, cancel
   - Key file: `apps/api/src/modules/stripe/services/stripe-reconciliation.service.ts`

**Prerequisite:** Set up Jest + NestJS testing utilities (no test infra exists currently).

---

## Performance

### Issue 13: Reconciliation makes 2x Stripe API calls per subscription

**Priority:** P2
**Decision:** Single-pass reconciliation
**What to do:** Refactor `reconcileAll()` to fetch each Stripe subscription once and run both subscription and add-on reconciliation on the same response. This halves API calls and reconciliation time.
**Effort:** ~2 hours
**Key files:**

- `apps/api/src/modules/stripe/services/stripe-reconciliation.service.ts`

---

### Issue 14: Entitlement enforcement does 4-6 DB round-trips per request

**Priority:** P3
**Decision:** Add in-memory caching for subscription + feature lookups
**What to do:** Cache `subscription` and `feature` records per tenant with a short TTL (30-60s). These change at most once a month (subscription renewal) or on app restart (feature sync). Invalidate on subscription change webhook.
**Effort:** ~3 hours
**Key files:**

- `apps/api/src/modules/entitlements/services/entitlement-enforcement.service.ts`

---

### Issue 15: Synchronous webhook processing risks Stripe timeout

**Priority:** P2
**Decision:** Acknowledge immediately, process async via BullMQ
**What to do:** Return `{ received: true }` immediately after signature verification + idempotency check. Queue the actual processing as a BullMQ job. Reuse existing retry-failed-webhooks admin endpoint for error recovery.
**Effort:** ~4 hours
**Key files:**

- `apps/api/src/modules/stripe/webhook/stripe-webhook.controller.ts`
- `apps/api/src/modules/stripe/webhook/stripe-webhook.service.ts`

---

### Issue 16: Credit balance query — verify index exists

**Priority:** P3
**Decision:** Verify index, add if missing
**What to do:** Check `009_entitlement_tables.sql` for an index on `credit_ledger(tenant_id, created_at DESC)`. If missing, add it.
**Effort:** ~15 minutes
**Key files:**

- `scripts/migrations/009_entitlement_tables.sql`

---

## Suggested Attack Order

| Order | Issue                                               | Effort   | Impact                         |
| ----- | --------------------------------------------------- | -------- | ------------------------------ |
| ✅    | Issue 2: `tenants.plan` elimination                 | Done     | Critical bug fixed             |
| ✅    | Issue 8: Extract Stripe period utility              | Done     | Quick win, reduces fragility   |
| ✅    | Issue 6 (quick fix): Fix SubscriptionsModule import | Done     | Quick win, fixes encapsulation |
| ✅    | Issue 1: Scheduled reconciliation                   | Done     | Reliability                    |
| 1     | Issue 3: Dunning automation                         | 1-2 days | Revenue protection             |
| 2     | Issue 5: Addon sync DRY refactor                    | 3 hours  | DRY                            |
| 3     | Issue 15: Async webhook processing                  | 4 hours  | Reliability at scale           |
| 4     | Issue 13: Single-pass reconciliation                | 2 hours  | API efficiency                 |
| 5     | Issue 4: Move catalog sync to CLI                   | 2 hours  | Operational safety             |
| 6     | Issue 7: Extract currency constants                 | 2 hours  | Future-proofing                |
| 7     | Issue 6 (full): Split StripeModule                  | 4 hours  | Maintainability                |
| 8     | Issue 14: In-memory caching                         | 3 hours  | Latency                        |
| 9     | Issue 16: Verify credit ledger index                | 15 min   | Quick win                      |
| 10    | Issues 9-12: Test coverage                          | 5-7 days | Launch readiness               |

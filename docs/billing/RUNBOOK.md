# Billing Operational Runbook

**Version:** 1.0
**Last Updated:** March 26, 2026

Operational procedures for Stripe billing: investigation, reconciliation, webhooks, credits, and catalog changes. For architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Table of Contents

- [Investigating a Billing Issue](#investigating-a-billing-issue)
- [Manually Reconciling Subscription State](#manually-reconciling-subscription-state)
- [Retrying Failed Webhooks](#retrying-failed-webhooks)
- [Granting Credits Manually](#granting-credits-manually)
- [Webhook Health](#webhook-health)
- [Stripe Dashboard Quick Reference](#stripe-dashboard-quick-reference)
- [Adding or Changing Credit Packages](#adding-or-changing-credit-packages)
- [Common Issues](#common-issues)

---

## Investigating a Billing Issue

1. **Identify tenant** — UUID from support ticket or `tenants` / admin tools.
2. **Our database:**
   - `tenant_subscriptions` — `plan_id`, `status`, `stripe_subscription_id`, `stripe_status`, `current_period_end`, `metadata` (JSON: dunning, `cancel_at_period_end`, etc.).
   - `tenants.stripe_customer_id` — link to Stripe Customer.
   - `stripe_webhook_events` — recent rows for `event_type`, `processing_status`, `processing_error`, `created_at`.
3. **Stripe Dashboard:** Customers → open `cus_...` → Subscriptions, Invoices, Events.
4. **Application logs:** Search for `StripeWebhook`, `StripeEventHandlers`, tenant id, `stripe_event_id`.
5. **Domain audit:** Query `domain_events` for `subscription.*` and `credit.*` types for the tenant.

Mismatch between Stripe and DB after an incident usually means a webhook failed or was not delivered—use reconciliation (below).

---

## Manually Reconciling Subscription State

**Preferred:** Call the admin API (identity cookie + platform role with `entitlements:manage`):

- **`POST /api/v1/admin/stripe/reconcile`** — Runs `StripeReconciliationService.reconcileAll()`: compares Stripe subscription and add-on items to our DB, fixes drift, emits domain events for fixes.

**When to use:**

- After partial outages or manual Stripe Dashboard edits.
- When support confirms Stripe shows the correct plan but our app does not.

**Related:**

- **`POST /api/v1/admin/stripe/backfill-customers`** — Create missing Stripe customers for tenants (idempotent).
- **`POST /api/v1/admin/stripe/backfill-tax`** — Sync tax-related customer data when `STRIPE_TAX_ENABLED=true`.

---

## Retrying Failed Webhooks

1. **Database:** `SELECT * FROM stripe_webhook_events WHERE processing_status = 'failed' ORDER BY created_at DESC LIMIT 50;`
2. **Admin API:** `POST /api/v1/admin/stripe/retry-failed-webhooks?maxRetries=3` — replays failed events through the normal processor (idempotency still applies).
3. **Stripe Dashboard:** Developers → Webhooks → select endpoint → **Events** → open event → **Resend** (sends a new delivery; our idempotency uses `stripe_event_id`).

---

## Granting Credits Manually

**Important:** Stripe Dashboard "credit balance" or ad-hoc charges do **not** automatically update our `credit_ledger`. Operational credit grants must go through our ledger.

**Options:**

1. **Engineering path (production-safe):** Invoke `CreditLedgerService.grant()` from a controlled internal script or REPL with correct tenant context, reason, and actor id — same semantics as product code; ensure audit requirements are met.
2. **Local development only:** with `ENABLE_MOCK_ROUTES=true`, the mock module exposes test endpoints under `mock/credits` (see `CreditsMockController`). They are never mounted when `NODE_ENV=production`.

Always record a **reason** and verify `domain_events` / `credit_ledger` after the operation.

---

## Webhook Health

**Admin API:**

- **`GET /api/v1/admin/stripe/webhook-stats?hours=24`** — Counts by status/type, failed samples, average processing time.

**SQL checks:**

```sql
SELECT processing_status, COUNT(*)
FROM stripe_webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY processing_status;
```

Investigate elevated `failed` counts with `processing_error` and application logs.

---

## Stripe Dashboard Quick Reference

| Need                        | Where                                               |
| --------------------------- | --------------------------------------------------- |
| Find customer               | Customers → search by email or `metadata` / id      |
| Subscription state          | Customer → Subscriptions                            |
| Invoices & payment failures | Customer → Invoices                                 |
| Event log                   | Developers → Events                                 |
| Webhook deliveries          | Developers → Webhooks → endpoint → Event deliveries |
| Products / Prices           | Product catalog (test vs live mode)                 |

**Test vs Live:** Dashboard mode must match the API keys in use.

---

## Adding or Changing Credit Packages

Credit packages are defined in code and synced to Stripe and the database.

1. **Edit constants** — `apps/api/src/common/constants/credit-packages.constant.ts`
   - Add or modify entries in `CREDIT_PACKAGES` (`key`, `name`, `credits`, `price` in AED per project conventions).

2. **Sync to Stripe and DB**
   - Set `STRIPE_CATALOG_SYNC_ENABLED=true` on deploy **or** run `POST /api/v1/admin/stripe/sync-catalog`.
   - This updates/creates Stripe Products/Prices and persists IDs on `credit_packages` (see migration `019_credit_packages.sql`).

3. **Verify**
   - `GET /api/v1/billing/credits/packages` (tenant token) returns the new package.
   - Test checkout: `POST /api/v1/billing/checkout/credits` with `packageKey`.

4. **Rollback** — Remove or revert the constant entry and re-sync; ensure no in-flight Checkout sessions reference removed keys.

---

## Common Issues

| Symptom                                                  | Likely cause                                                    | Mitigation                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Webhook signature verification failed`                  | Wrong `STRIPE_WEBHOOK_SECRET`, or body was parsed before verify | Use CLI `whsec` for local; ensure raw body; no proxy altering body          |
| `Plan not found` / missing price                         | Catalog sync not run                                            | Enable sync or call `admin/stripe/sync-catalog`                             |
| `No local subscription found for stripe_subscription_id` | Webhook arrived before DB row, or wrong Stripe account          | Reconcile; confirm tenant's subscription row exists                         |
| Duplicate webhook acknowledged                           | Same `evt_` replayed                                            | Expected; idempotency returns 200                                           |
| Customer not created                                     | `STRIPE_SKIP_CUSTOMER_CREATION=true` or missing secret key      | Check env; run `backfill-customers` if needed                               |
| Credits not after successful payment                     | `checkout.session.completed` not processed or wrong metadata    | Check `stripe_webhook_events`; verify session metadata for credit purchases |

---

## Related Documentation

- [README.md](README.md) — Billing doc index
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture and webhooks
- [DEVELOPMENT.md](DEVELOPMENT.md) — Stripe setup
- [TESTING.md](TESTING.md) — Testing guide
- [ENTITLEMENTS.md](../ENTITLEMENTS.md) — Plans and credits

---

[Back to billing index](README.md)

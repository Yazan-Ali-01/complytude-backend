# Billing & Stripe Integration

This folder contains comprehensive billing documentation for the Stripe integration, including architecture, development setup, and operational procedures.

## Quick Navigation

| Document                               | Purpose                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| **[README.md](README.md)**             | This file — billing doc index                                              |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Stripe architecture, data flows, webhook catalog, object mappings          |
| **[DEVELOPMENT.md](DEVELOPMENT.md)**   | Local Stripe setup: keys, CLI, webhook forwarding, test cards              |
| **[RUNBOOK.md](RUNBOOK.md)**           | Operations: investigation, reconciliation, webhook retry, credits, catalog |
| **[TESTING.md](TESTING.md)**           | Testing with Apidog/Postman: auth, checkout, webhooks, admin endpoints     |

## For Different Roles

### Frontend / Product Managers

- Start: [ARCHITECTURE.md](ARCHITECTURE.md#stripe-object-model-mapping) — Stripe object model
- Read: [DEVELOPMENT.md](DEVELOPMENT.md#test-card-numbers) — Test card numbers for demo
- Reference: Root-level [../API_CONTRACTS.md](../../apps/api/docs/API_CONTRACTS.md#billing-api) — Billing API endpoints

### Backend / API Developers

- Setup: [DEVELOPMENT.md](DEVELOPMENT.md) — Full local dev setup with CLI
- Understand: [ARCHITECTURE.md](ARCHITECTURE.md) — System design and webhook processing
- Test: [TESTING.md](TESTING.md) — API testing patterns
- Reference: [API_CONTRACTS.md](../../apps/api/docs/API_CONTRACTS.md#billing-api) — Endpoint details

### Operations / Support

- Quick ref: [RUNBOOK.md](RUNBOOK.md) — Investigate, reconcile, troubleshoot
- Health check: [RUNBOOK.md#webhook-health](RUNBOOK.md#webhook-health) — Monitor webhook delivery
- Reference: [ARCHITECTURE.md#common-issues](ARCHITECTURE.md#common-issues) — Troubleshooting

## Key Topics at a Glance

### Source of Truth

| Concern                                    | Owner                             |
| ------------------------------------------ | --------------------------------- |
| Payments, invoices, subscription lifecycle | **Stripe**                        |
| Plans, features, usage, credits balance    | **Our PostgreSQL**                |
| Webhook durability and idempotency         | **`stripe_webhook_events` table** |

See [ARCHITECTURE.md#source-of-truth](ARCHITECTURE.md#source-of-truth) for details.

### Webhook Processing Flow

1. **Stripe** → sends event to `/api/v1/stripe/webhook`
2. **Signature verified** with `STRIPE_WEBHOOK_SECRET`
3. **Event stored** in `stripe_webhook_events` with status `pending`
4. **Job enqueued** to `BILLING_PROCESSING` queue
5. **Processed async** by `StripeWebhookProcessingHandler`
6. **Domain events** emitted for audit trail

See [ARCHITECTURE.md#webhook-processing](ARCHITECTURE.md#webhook-processing) for details.

### Catalog Sync

Plans, add-ons, and credit packages are defined in code and synced to Stripe and the database.

- When: Startup (if `STRIPE_CATALOG_SYNC_ENABLED=true`) or manual call `POST /api/v1/admin/stripe/sync-catalog`
- What: Creates/updates Stripe Products/Prices; persists IDs on plan/addon/credit_packages rows
- Why: Checkout needs Stripe price IDs to create sessions

See [DEVELOPMENT.md#catalog-sync](DEVELOPMENT.md#catalog-sync) and [RUNBOOK.md#adding-or-changing-credit-packages](RUNBOOK.md#adding-or-changing-credit-packages).

## Environment Variables

```bash
# Required
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (or sk_test_... for CLI testing)
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Optional
STRIPE_CATALOG_SYNC_ENABLED=false  # Set to true to sync on startup
STRIPE_TAX_ENABLED=false          # Enable Stripe Tax features
```

See [DEVELOPMENT.md#environment-variables](DEVELOPMENT.md#environment-variables) for full list.

## Related Documentation

- **Monorepo-wide:** [Entitlements](../ENTITLEMENTS.md), [Architecture](../ARCHITECTURE.md), [Database](../DATABASE.md)
- **API:** [API_CONTRACTS.md — Billing API section](../../apps/api/docs/API_CONTRACTS.md#billing-api)
- **Testing:** [apps/api/docs/BILLING_TESTING.md](../../apps/api/docs/BILLING_TESTING.md)

---

[Back to documentation index](../README.md)

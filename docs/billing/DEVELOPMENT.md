# Stripe Development Setup

**Version:** 1.0
**Last Updated:** March 26, 2026

This guide covers local and staging setup for Stripe integration. For architecture and webhooks, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Table of Contents

- [Stripe Test Mode](#stripe-test-mode)
- [API Keys](#api-keys)
- [Environment Variables](#environment-variables)
- [Stripe CLI](#stripe-cli)
- [Webhook Forwarding (Local)](#webhook-forwarding-local)
- [Test Card Numbers](#test-card-numbers)
- [Triggering Test Events](#triggering-test-events)
- [Catalog Sync](#catalog-sync)

---

## Stripe Test Mode

1. Create or use a [Stripe account](https://dashboard.stripe.com/register).
2. Toggle **Test mode** in the Stripe Dashboard (switch in the top bar).
3. All Dashboard objects (Customers, Products, Prices) created in test mode use test card numbers and do not move real money.

Use **separate** test keys for local development; never commit live keys.

---

## API Keys

In the Stripe Dashboard (**Developers → API keys**):

| Key                                 | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| **Publishable key** (`pk_test_...`) | Frontend Stripe.js / Checkout redirects (if used) |
| **Secret key** (`sk_test_...`)      | Server-side API calls (`STRIPE_SECRET_KEY`)       |

Copy both into your app environment (see below). The secret key must only exist on the server.

---

## Environment Variables

Configure `apps/api/.env` (see `apps/api/.env.example` for the full template). Relevant variables:

| Variable                        | Required | Description                                                                   |
| ------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`             | Yes      | Secret API key (`sk_test_...` or `sk_live_...`)                               |
| `STRIPE_WEBHOOK_SECRET`         | Yes      | Signing secret from the webhook endpoint or `stripe listen`                   |
| `STRIPE_PUBLISHABLE_KEY`        | Yes      | Publishable key (`pk_test_...`) — validated at startup                        |
| `STRIPE_CATALOG_SYNC_ENABLED`   | No       | `true` to sync plans/add-ons/credit packages to Stripe on startup             |
| `STRIPE_TAX_ENABLED`            | No       | `true` to enable Stripe Tax features in services that support it              |

**Webhook secret for local CLI:** When you run `stripe listen`, the CLI prints a **webhook signing secret** (`whsec_...`). Use that value for `STRIPE_WEBHOOK_SECRET` while developing locally.

---

## Stripe CLI

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) for your OS.

**Login (links CLI to your account):**

```bash
stripe login
```

**Useful commands:**

- `stripe listen --forward-to localhost:3000/api/v1/stripe/webhook` — forward events to the API (see below).
- `stripe trigger checkout.session.completed` — emit a sample event (payload may not match our metadata; prefer real Checkout flows for integration tests).
- `stripe logs tail` — stream API request logs.

---

## Webhook Forwarding (Local)

1. Start the API: `pnpm start:api` (from repo root; default port often `3000`).
2. In a separate terminal:

   ```bash
   stripe listen --forward-to localhost:3000/api/v1/stripe/webhook
   ```

3. Copy the **`whsec_...`** signing secret into `STRIPE_WEBHOOK_SECRET` and restart the API if needed.
4. Complete a Checkout session or trigger events; the CLI shows delivered requests.

**Why `/api/v1/stripe/webhook`?** The webhook controller is mounted at `stripe/webhook` under the global `api` prefix and URI version `v1`.

**Raw body:** The API must receive the **raw** request body for signature verification (`rawBody` in Fastify). Do not parse JSON before Stripe middleware.

---

## Test Card Numbers

Use these [test card numbers](https://docs.stripe.com/testing) with any future expiry and any CVC:

| Scenario                      | Number             |
| ----------------------------- | ------------------ |
| Success                       | `4242424242424242` |
| Decline (generic)             | `4000000000000002` |
| Requires authentication (3DS) | `4000002500003155` |
| Insufficient funds            | `4000000000009995` |
| Expired card                  | `4000000000000069` |

For **declined** Checkout flows, use cards documented under Stripe's "Declined payment" scenarios.

---

## Triggering Test Events

1. **Realistic path:** Call tenant-authenticated billing endpoints (`POST /api/v1/billing/checkout/subscription` or `.../checkout/credits`) with test keys and complete Checkout in the browser.
2. **CLI smoke:** `stripe trigger <event_type>` — useful to verify forwarding; handlers may no-op if metadata (`complytude_tenant_id`, etc.) is missing.
3. **Dashboard:** Developers → **Events** → select an event → **Resend** to a webhook endpoint (staging).

---

## Catalog Sync

Plans, add-ons, and credit packages need Stripe Product/Price IDs for Checkout.

1. Set `STRIPE_CATALOG_SYNC_ENABLED=true` **or** call `POST /api/v1/admin/stripe/sync-catalog` (platform permission `entitlements:manage`).
2. Confirm `plans`, `addons`, and `credit_packages` rows have `stripe_*` IDs populated.

See [RUNBOOK.md#adding-or-changing-credit-packages](RUNBOOK.md#adding-or-changing-credit-packages) for adding new credit packages.

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture and webhook catalog
- [RUNBOOK.md](RUNBOOK.md) — Operations
- [TESTING.md](TESTING.md) — Testing guide
- [API Contracts — Billing](../../apps/api/docs/API_CONTRACTS.md#billing-api)

---

[Back to billing index](README.md)

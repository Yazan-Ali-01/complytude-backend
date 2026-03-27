# Billing API Testing

**Version:** 1.0
**Last Updated:** March 26, 2026

Testing strategies for Stripe billing APIs using Apidog, Postman, cURL, and CLI. For architecture and operations, see [ARCHITECTURE.md](ARCHITECTURE.md) and [RUNBOOK.md](RUNBOOK.md).

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setting Up Apidog / Postman](#setting-up-apidog--postman)
- [Subscription Checkout Testing](#subscription-checkout-testing)
- [Credit Purchase Testing](#credit-purchase-testing)
- [Webhook Testing](#webhook-testing)
- [Admin Endpoints](#admin-endpoints)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- API running locally or on staging.
- Stripe test account with API keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`).
- **Apidog** or **Postman** installed.
- **Stripe CLI** installed (`brew install stripe/stripe-cli/stripe` on macOS, or from [docs](https://stripe.com/docs/stripe-cli)).
- A tenant account for testing (created via app or mock fixture).

---

## Setting Up Apidog / Postman

1. **Create a new project** in Apidog/Postman.
2. **Environment variables:**
   Create an environment with:
   - `base_url` = `http://localhost:3000/api/v1` (or staging URL)
   - `tenant_token` = (your test tenant's identity token; get from login/JWT)
   - `identity_token` = (identity token with platform role and `entitlements:manage` permission for admin endpoints)
   - `stripe_secret_key` = `sk_test_...`

3. **Global auth header:**
   For tenant endpoints, add a `Cookie` header or `Authorization: Bearer {{tenant_token}}`.
   For admin endpoints, use `Authorization: Bearer {{identity_token}}` (platform admin token).

---

## Subscription Checkout Testing

### Step 1: Create Checkout Session

**Endpoint:** `POST {{base_url}}/billing/checkout/subscription`
**Auth:** Tenant token

**Body:**

```json
{
  "planKey": "pro",
  "billingInterval": "monthly"
}
```

**Expected response:**

```json
{
  "id": "cs_test_...",
  "url": "https://checkout.stripe.com/pay/cs_test_...",
  "object": "checkout.session"
}
```

### Step 2: Complete Checkout (Simulated)

**Option A: Browser (realistic)**

1. Open the `url` from the response.
2. Use a test card: `4242424242424242`, expiry `12/34`, CVC `123`.
3. Complete the checkout flow.

**Option B: CLI (smoke test)**

```bash
stripe trigger checkout.session.completed
```

This emits a generic sample event (metadata may not match our tenant context; less reliable for integration).

### Step 3: Verify

- Check `tenant_subscriptions` — new row with `plan_id=1` (Pro), `stripe_subscription_id` set, `status='active'`.
- Check `domain_events` — `subscription.created` event for your tenant.

---

## Credit Purchase Testing

### Step 1: List Packages

**Endpoint:** `GET {{base_url}}/billing/credits/packages`
**Auth:** Tenant token

**Expected:**

```json
[
  {
    "key": "credit_100",
    "name": "100 Credits",
    "amount": 100,
    "priceAED": 500
  },
  ...
]
```

### Step 2: Create Credit Checkout

**Endpoint:** `POST {{base_url}}/billing/checkout/credits`
**Auth:** Tenant token

**Body:**

```json
{
  "packageKey": "credit_100"
}
```

**Expected response:**

```json
{
  "id": "cs_test_...",
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

### Step 3: Complete & Verify

1. Open the URL, complete with test card.
2. Check `credit_ledger` — new `PURCHASE` row.
3. Check `tenants.credit_balance` or `GET /billing/status` — increased balance.

---

## Webhook Testing

### Using Stripe CLI

1. **Start forwarding:**

   ```bash
   stripe listen --forward-to localhost:3000/api/v1/stripe/webhook
   ```

2. **Trigger test event (with real Checkout flow preferred):**
   - Complete a test Checkout (Option A above), **or**
   - Use CLI to trigger: `stripe trigger invoice.paid` (emits generic payload).

3. **Verify in logs:**
   - CLI output shows delivery status.
   - Application logs show `StripeWebhook*` processing.
   - Database `stripe_webhook_events` shows `processing_status='completed'`.

### Realistic testing

**Best practice:** Complete Checkout flows in the browser to generate real event payloads matching your tenant metadata.

1. `POST /billing/checkout/subscription` → get URL.
2. Browser → complete payment.
3. Stripe sends `checkout.session.completed` + subscription lifecycle events.
4. Check your database and domain events for correctness.

---

## Admin Endpoints

**Auth:** Platform identity token with `entitlements:manage` permission.

### Catalog Sync

**`POST {{base_url}}/admin/stripe/sync-catalog`**

Syncs plans, add-ons, and credit packages to Stripe and updates local rows with product/price IDs.

```bash
curl -X POST http://localhost:3000/api/v1/admin/stripe/sync-catalog \
  -H "Authorization: Bearer {{identity_token}}"
```

### Reconciliation

**`POST {{base_url}}/admin/stripe/reconcile`**

Compares Stripe subscriptions to our DB and fixes drift.

```bash
curl -X POST http://localhost:3000/api/v1/admin/stripe/reconcile \
  -H "Authorization: Bearer {{identity_token}}"
```

### Webhook Stats

**`GET {{base_url}}/admin/stripe/webhook-stats?hours=24`**

Health check for webhooks.

```bash
curl http://localhost:3000/api/v1/admin/stripe/webhook-stats?hours=24 \
  -H "Authorization: Bearer {{identity_token}}"
```

### Retry Failed Webhooks

**`POST {{base_url}}/admin/stripe/retry-failed-webhooks?maxRetries=3`**

```bash
curl -X POST http://localhost:3000/api/v1/admin/stripe/retry-failed-webhooks?maxRetries=3 \
  -H "Authorization: Bearer {{identity_token}}"
```

---

## Troubleshooting

| Issue                                    | Cause                         | Solution                                                     |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| Checkout returns 400 `planKey not found` | Catalog not synced            | Call `POST /admin/stripe/sync-catalog`                       |
| Webhook not forwarded                    | CLI not running or wrong port | Verify `stripe listen --forward-to` and API port             |
| Signature verification failed            | Wrong `STRIPE_WEBHOOK_SECRET` | Use secret from CLI output                                   |
| Subscription created but no domain event | Event processing failed       | Check `stripe_webhook_events.processing_error` and app logs  |
| Credit balance not updated               | Checkout metadata wrong       | Verify `checkout_type=credit_purchase` in session metadata   |
| `Cannot find tenant by token`            | Auth issue                    | Ensure tenant token is in `Cookie` or `Authorization` header |

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture and webhooks
- [DEVELOPMENT.md](DEVELOPMENT.md) — Stripe setup
- [RUNBOOK.md](RUNBOOK.md) — Operations
- [API Contracts — Billing](../../apps/api/docs/API_CONTRACTS.md#billing-api)

---

[Back to billing index](README.md)

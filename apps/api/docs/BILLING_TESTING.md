# Billing & Stripe — Testing Guide

**Last Updated:** March 26, 2026

How to verify billing endpoints and webhooks locally using **Apidog** (or Postman), **cURL**, and the **Stripe CLI**. For architecture, see [BILLING.md](../../../docs/BILLING.md); for setup, see [STRIPE_DEVELOPMENT.md](../../../docs/STRIPE_DEVELOPMENT.md).

---

## Prerequisites

1. **Stack:** `docker-compose up -d postgres redis` (and other deps per main README).
2. **Migrations + seed:** `pnpm db:migrate` and optionally `pnpm db:seed`.
3. **Stripe env:** In `apps/api/.env`, set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (test keys). For webhooks locally, use the `whsec_...` from `stripe listen` (see below).
4. **API:** `pnpm start:api` — default `http://localhost:3000`.

---

## 1. Apidog / Postman collection

1. Create an environment with `baseUrl = http://localhost:3000`.
2. **Cookies:** Billing routes need a **tenant** JWT. Easiest path:
   - Complete auth flow: signup → verify → login → create tenant → `POST /api/v1/auth/tenant-switch` (see [API_CONTRACTS.md](API_CONTRACTS.md#complete-signup-to-operational-flow)).
   - Export cookies from the browser devtools or configure Apidog to store `tenantAccessToken` / `identityAccessToken` from login responses if your client exposes them (this API uses **HTTP-only cookies** — prefer **Cookie** plugin or browser session import).
3. Add requests under folder **Billing**:
   - `GET {{baseUrl}}/api/v1/billing/status`
   - `GET {{baseUrl}}/api/v1/billing/credits/packages`
   - `POST {{baseUrl}}/api/v1/billing/checkout/subscription` (body: JSON per [API_CONTRACTS — Billing API](API_CONTRACTS.md#billing-api))

**Permission:** Mutating routes need a user with **`billing:manage`** (e.g. `tenant_admin` includes billing permissions per RBAC — confirm in [RBAC.md](../../../docs/RBAC.md)).

---

## 2. Webhook testing (required for checkout)

The API does **not** apply subscription/credit changes until Stripe webhooks are processed.

1. Terminal A: `pnpm start:api`
2. Terminal B:

   ```bash
   stripe listen --forward-to localhost:3000/api/v1/stripe/webhook
   ```

3. Copy the printed **`whsec_...`** into `STRIPE_WEBHOOK_SECRET` and restart the API.
4. Complete a Checkout session (open `checkoutUrl` from `POST .../checkout/subscription` or credits).
5. Confirm in logs: webhook queued and processed; DB: `stripe_webhook_events.processing_status = completed`.

**Stripe Dashboard:** Developers → Events — confirm delivery to your CLI or deployed endpoint.

---

## 3. cURL smoke (tenant cookie)

After you have a valid `tenantAccessToken` cookie value (from browser or login script):

```bash
curl -sS -b "tenantAccessToken=YOUR_JWT_HERE" \
  http://localhost:3000/api/v1/billing/credits/packages | jq
```

Replace with your actual cookie name/value from application config.

---

## 4. Admin endpoints (reconciliation / stats)

Use an **identity** token for a platform user with `entitlements:manage` (e.g. seeded system admin if available).

Example:

```bash
curl -sS -b "identityAccessToken=YOUR_IDENTITY_JWT" \
  "http://localhost:3000/api/v1/admin/stripe/webhook-stats?hours=24" | jq
```

---

## 5. Swagger

Interactive docs: `http://localhost:3000/docs` — filter by tags **billing** and **System Admin - Stripe**.

---

## 6. Troubleshooting

| Issue                              | Check                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| 401 on billing routes              | Tenant cookie missing or expired; call refresh or re-login |
| 403 on POST billing                | User lacks `billing:manage`                                |
| Checkout succeeds but DB unchanged | Webhook not forwarded / wrong `STRIPE_WEBHOOK_SECRET`      |
| Signature errors                   | `stripe listen` secret must match API env; use raw body    |

---

## Related

- [APIDOG_SESSION_TESTING_GUIDE.md](APIDOG_SESSION_TESTING_GUIDE.md) — Cookie/session patterns for Apidog
- [API_CONTRACTS.md — Billing API](API_CONTRACTS.md#billing-api)

---

[Back to API documentation index](README.md)

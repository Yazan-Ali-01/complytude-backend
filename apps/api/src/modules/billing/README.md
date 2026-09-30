# Billing Module

Handles billing-related background jobs and scheduled tasks.

## Features

### Scheduled Reconciliation

- **Daily Stripe reconciliation** runs at 3 AM via BullMQ cron job
- Catches webhook-miss drift within 24 hours
- Automatically enabled in production
- Can be enabled in development via `BILLING_SCHEDULE_ENABLED=true`

### Free-plan Renewal

- `subscription-renewal` runs every hour in every environment (it calls no provider)
- Renews local (free-plan) subscriptions whose period has ended, up to the period containing now; their monthly allowances start again (usage counts per billing period)
- Stripe-backed subscriptions renew through Stripe's webhooks instead

### Webhook Re-drive

- `stripe-webhook-redrive` runs every 5 minutes (scheduled with reconciliation)
- Retries failed Stripe webhook events whose backoff is due (1 minute doubling to 6 hours, up to 20 attempts), and events stranded by a lost job or a crashed worker
- Logs `Stripe webhook events failing: …` as an error while any event is failed

### Dunning Automation

- Email sequences for failed payments (day 0, 3, 5)
- Triggered by `invoice.payment_failed` webhook
- Uses hosted invoice URL for payment retry

## Configuration

```bash
# Enable scheduled billing jobs (auto-enabled in production)
BILLING_SCHEDULE_ENABLED=true
```

## Manual Testing

### Test Scheduled Reconciliation

```bash
# 1. Start the API with scheduling enabled
BILLING_SCHEDULE_ENABLED=true pnpm dev

# 2. Manually trigger reconciliation job (same as scheduled)
curl -X POST http://localhost:3000/api/admin/queue-test/enqueue/billing/reconciliation

# 3. Check job status
curl http://localhost:3000/api/admin/queue-test/jobs/billing
```

### Verify Scheduling on Startup

Check logs on startup:
```
[BillingSchedulerService] Scheduled daily Stripe reconciliation job (3 AM)
```

Or if disabled:
```
[BillingSchedulerService] Billing job scheduling disabled
```

## Architecture

- **BillingSchedulerService**: Sets up recurring jobs on app startup
- **DunningJobProcessor**: Processes all billing queue jobs
- **StripeReconciliationHandler**: Executes reconciliation logic
- **DunningEmailHandler**: Sends dunning email sequences

## Job Flow

```
App Startup → BillingSchedulerService → Schedule Cron Job
     ↓
Daily 3 AM → BullMQ → DunningJobProcessor → StripeReconciliationHandler
     ↓
StripeReconciliationService.reconcileAll() → Sync DB with Stripe
```

## Related Files

- `services/billing-scheduler.service.ts` - Job scheduling
- `processors/dunning-job.processor.ts` - Job routing
- `handlers/stripe-reconciliation.handler.ts` - Reconciliation execution
- `../stripe/services/stripe-reconciliation.service.ts` - Reconciliation logic
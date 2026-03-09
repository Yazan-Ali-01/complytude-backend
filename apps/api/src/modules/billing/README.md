# Billing Module

Handles billing-related background jobs and scheduled tasks.

## Features

### Scheduled Reconciliation

- **Daily Stripe reconciliation** runs at 3 AM via BullMQ cron job
- Catches webhook-miss drift within 24 hours
- Automatically enabled in production
- Can be enabled in development via `BILLING_SCHEDULE_ENABLED=true`

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
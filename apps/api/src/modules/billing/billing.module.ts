import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { StripeWebhookModule, StripeAdminModule } from '../stripe/modules';
import { TenantModule } from '../tenants/tenant.module';
import { DunningJobProcessor } from './processors/dunning-job.processor';
import { DunningEmailHandler } from './handlers/dunning-email.handler';
import { PaymentActionRequiredHandler } from './handlers/payment-action-required.handler';
import { StripeReconciliationHandler } from './handlers/stripe-reconciliation.handler';
import { StripeWebhookProcessingHandler } from './handlers/stripe-webhook-processing.handler';
import { StripeWebhookRedriveHandler } from './handlers/stripe-webhook-redrive.handler';
import { BillingSchedulerService } from './services/billing-scheduler.service';

@Module({
  imports: [EmailModule, StripeWebhookModule, StripeAdminModule, TenantModule],
  providers: [
    DunningJobProcessor,
    DunningEmailHandler,
    PaymentActionRequiredHandler,
    StripeReconciliationHandler,
    StripeWebhookProcessingHandler,
    StripeWebhookRedriveHandler,
    BillingSchedulerService,
  ],
  exports: [
    DunningEmailHandler,
    StripeReconciliationHandler,
    StripeWebhookProcessingHandler,
  ],
})
export class BillingModule {}

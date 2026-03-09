import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { StripeWebhookModule, StripeAdminModule } from '../stripe/modules';
import { DunningJobProcessor } from './processors/dunning-job.processor';
import { DunningEmailHandler } from './handlers/dunning-email.handler';
import { StripeReconciliationHandler } from './handlers/stripe-reconciliation.handler';
import { StripeWebhookProcessingHandler } from './handlers/stripe-webhook-processing.handler';
import { BillingSchedulerService } from './services/billing-scheduler.service';

@Module({
  imports: [EmailModule, StripeWebhookModule, StripeAdminModule],
  providers: [
    DunningJobProcessor,
    DunningEmailHandler,
    StripeReconciliationHandler,
    StripeWebhookProcessingHandler,
    BillingSchedulerService,
  ],
  exports: [
    DunningEmailHandler,
    StripeReconciliationHandler,
    StripeWebhookProcessingHandler,
  ],
})
export class BillingModule {}

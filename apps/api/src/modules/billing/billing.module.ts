import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { StripeModule } from '../stripe/stripe.module';
import { DunningJobProcessor } from './processors/dunning-job.processor';
import { DunningEmailHandler } from './handlers/dunning-email.handler';
import { StripeReconciliationHandler } from './handlers/stripe-reconciliation.handler';
import { BillingSchedulerService } from './services/billing-scheduler.service';

@Module({
  imports: [EmailModule, StripeModule],
  providers: [
    DunningJobProcessor,
    DunningEmailHandler,
    StripeReconciliationHandler,
    BillingSchedulerService,
  ],
  exports: [DunningEmailHandler, StripeReconciliationHandler],
})
export class BillingModule {}

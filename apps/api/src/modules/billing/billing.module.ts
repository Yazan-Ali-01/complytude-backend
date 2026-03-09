import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { DunningJobProcessor } from './processors/dunning-job.processor';
import { DunningEmailHandler } from './handlers/dunning-email.handler';
import { StripeReconciliationHandler } from './handlers/stripe-reconciliation.handler';

@Module({
  imports: [EmailModule],
  providers: [
    DunningJobProcessor,
    DunningEmailHandler,
    StripeReconciliationHandler,
  ],
  exports: [DunningEmailHandler, StripeReconciliationHandler],
})
export class BillingModule {}

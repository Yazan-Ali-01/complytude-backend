import {
  AbstractProcessor,
  BILLING_JOB_NAMES,
  DunningEmailJobData,
  Job,
  PaymentActionRequiredJobData,
  Processor,
  QUEUE_NAMES,
  StripeReconciliationJobData,
  StripeWebhookProcessingJobData,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { DunningEmailHandler } from '../handlers/dunning-email.handler';
import { PaymentActionRequiredHandler } from '../handlers/payment-action-required.handler';
import { StripeReconciliationHandler } from '../handlers/stripe-reconciliation.handler';
import { StripeWebhookProcessingHandler } from '../handlers/stripe-webhook-processing.handler';
import { StripeWebhookRedriveHandler } from '../handlers/stripe-webhook-redrive.handler';

/**
 * Billing Queue Processor
 *
 * Single @Processor for the BILLING_PROCESSING queue. Routes jobs by
 * job.name to the appropriate handler service.
 *
 * Handles:
 * - Dunning email sequences (day0, day3, day5)
 * - Stripe reconciliation jobs (scheduled and manual)
 * - Stripe webhook processing (async webhook handling)
 * - Stripe webhook re-drive (scheduled sweep of failed events)
 */
@Processor(QUEUE_NAMES.BILLING_PROCESSING)
export class DunningJobProcessor extends AbstractProcessor<unknown> {
  protected readonly logger = new Logger(DunningJobProcessor.name);

  constructor(
    private readonly dunningEmailHandler: DunningEmailHandler,
    private readonly paymentActionRequiredHandler: PaymentActionRequiredHandler,
    private readonly stripeReconciliationHandler: StripeReconciliationHandler,
    private readonly stripeWebhookProcessingHandler: StripeWebhookProcessingHandler,
    private readonly stripeWebhookRedriveHandler: StripeWebhookRedriveHandler,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case BILLING_JOB_NAMES.DUNNING_EMAIL:
        return this.dunningEmailHandler.execute(
          job as Job<DunningEmailJobData>,
        );

      case BILLING_JOB_NAMES.PAYMENT_ACTION_REQUIRED:
        return this.paymentActionRequiredHandler.execute(
          job as Job<PaymentActionRequiredJobData>,
        );

      case BILLING_JOB_NAMES.STRIPE_RECONCILIATION:
        return this.stripeReconciliationHandler.execute(
          job as Job<StripeReconciliationJobData>,
        );

      case BILLING_JOB_NAMES.STRIPE_WEBHOOK_PROCESSING:
        return this.stripeWebhookProcessingHandler.execute(
          job as Job<StripeWebhookProcessingJobData>,
        );

      case BILLING_JOB_NAMES.STRIPE_WEBHOOK_REDRIVE:
        return this.stripeWebhookRedriveHandler.execute();

      default:
        throw new Error(`Unknown billing job type: ${job.name}`);
    }
  }
}

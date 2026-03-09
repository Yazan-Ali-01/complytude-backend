import {
  AbstractProcessor,
  BILLING_JOB_NAMES,
  DunningEmailJobData,
  Job,
  Processor,
  QUEUE_NAMES,
  StripeReconciliationJobData,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { DunningEmailHandler } from '../handlers/dunning-email.handler';
import { StripeReconciliationHandler } from '../handlers/stripe-reconciliation.handler';

/**
 * Billing Queue Processor
 *
 * Single @Processor for the BILLING_PROCESSING queue. Routes jobs by
 * job.name to the appropriate handler service.
 *
 * Handles:
 * - Dunning email sequences (day0, day3, day5)
 * - Stripe reconciliation jobs (scheduled and manual)
 */
@Processor(QUEUE_NAMES.BILLING_PROCESSING)
export class DunningJobProcessor extends AbstractProcessor<unknown> {
  protected readonly logger = new Logger(DunningJobProcessor.name);

  constructor(
    private readonly dunningEmailHandler: DunningEmailHandler,
    private readonly stripeReconciliationHandler: StripeReconciliationHandler,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case BILLING_JOB_NAMES.DUNNING_EMAIL:
        return this.dunningEmailHandler.execute(
          job as Job<DunningEmailJobData>,
        );

      case BILLING_JOB_NAMES.STRIPE_RECONCILIATION:
        return this.stripeReconciliationHandler.execute(
          job as Job<StripeReconciliationJobData>,
        );

      default:
        throw new Error(`Unknown billing job type: ${job.name}`);
    }
  }
}

import {
  AbstractProcessor,
  Job,
  PermanentError,
  Processor,
  QUEUE_NAMES,
  TENANT_JOB_NAMES,
  TenantStripeCustomerCreationJobData,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { StripeCustomerCreationHandler } from './handlers/stripe-customer-creation.handler';

/**
 * Tenant Queue Processor
 *
 * Single @Processor for the TENANT_PROCESSING queue. Routes jobs by
 * job.name to the appropriate handler service.
 *
 * Handles tenant lifecycle side effects that must be decoupled from the
 * core tenant write path (e.g. Stripe customer provisioning).
 *
 * To add a new job type:
 * 1. Add job name + data interface to libs/queue/src/interfaces/tenant-processing.jobs.ts
 * 2. Add handler as a constructor dependency
 * 3. Add a case for it in handle()
 */
@Processor(QUEUE_NAMES.TENANT_PROCESSING)
export class TenantQueueProcessor extends AbstractProcessor<unknown> {
  protected readonly logger = new Logger(TenantQueueProcessor.name);

  constructor(
    private readonly stripeCustomerCreationHandler: StripeCustomerCreationHandler,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case TENANT_JOB_NAMES.STRIPE_CUSTOMER_CREATION:
        return this.stripeCustomerCreationHandler.execute(
          job as Job<TenantStripeCustomerCreationJobData>,
        );

      default:
        throw new PermanentError(
          `No handler registered for job name="${job.name}" — ` +
            `register a handler in TenantQueueProcessor.handle().`,
        );
    }
  }
}

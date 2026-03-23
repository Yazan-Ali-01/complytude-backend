import {
  AbstractProcessor,
  ENTITLEMENT_JOB_NAMES,
  EntitlementCreditNotificationJobData,
  EntitlementDomainEventFanoutJobData,
  EntitlementProjectionUpdateJobData,
  EntitlementQuotaExceededJobData,
  EntitlementSnapshotRebuildJobData,
  EntitlementTrialExpiryCheckJobData,
  Job,
  PermanentError,
  Processor,
  QUEUE_NAMES,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { CreditNotificationHandler } from './credit-notification.handler';
import { DomainEventFanoutHandler } from './domain-event-fanout.handler';
import { ProjectionUpdateHandler } from './projection-update.handler';
import { QuotaExceededHandler } from './quota-exceeded.handler';
import { SnapshotRebuildHandler } from './snapshot-rebuild.handler';
import { TrialExpiryHandler } from './trial-expiry.handler';

/**
 * Entitlement Queue Processor
 *
 * Single @Processor for the ENTITLEMENT_PROCESSING queue. Routes jobs by
 * job.name to the appropriate handler service.
 *
 * Only one @Processor-decorated class can exist per queue name in
 * @nestjs/bullmq, so all entitlement job types are dispatched from here.
 * Individual handlers are @Injectable() services for testability.
 *
 * To add a new job type:
 * 1. Add the handler as a constructor dependency
 * 2. Add a case for it in handle()
 */
@Processor(QUEUE_NAMES.ENTITLEMENT_PROCESSING)
export class EntitlementQueueProcessor extends AbstractProcessor<unknown> {
  protected readonly logger = new Logger(EntitlementQueueProcessor.name);

  constructor(
    private readonly projectionUpdateHandler: ProjectionUpdateHandler,
    private readonly snapshotRebuildHandler: SnapshotRebuildHandler,
    private readonly domainEventFanoutHandler: DomainEventFanoutHandler,
    private readonly creditNotificationHandler: CreditNotificationHandler,
    private readonly quotaExceededHandler: QuotaExceededHandler,
    private readonly trialExpiryHandler: TrialExpiryHandler,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case ENTITLEMENT_JOB_NAMES.PROJECTION_UPDATE:
        return this.projectionUpdateHandler.execute(
          job as Job<EntitlementProjectionUpdateJobData>,
        );

      case ENTITLEMENT_JOB_NAMES.SNAPSHOT_REBUILD:
        return this.snapshotRebuildHandler.execute(
          job as Job<EntitlementSnapshotRebuildJobData>,
        );

      case ENTITLEMENT_JOB_NAMES.DOMAIN_EVENT_FANOUT:
        return this.domainEventFanoutHandler.execute(
          job as Job<EntitlementDomainEventFanoutJobData>,
        );

      case ENTITLEMENT_JOB_NAMES.CREDIT_NOTIFICATION:
        return this.creditNotificationHandler.execute(
          job as Job<EntitlementCreditNotificationJobData>,
        );

      case ENTITLEMENT_JOB_NAMES.QUOTA_EXCEEDED:
        return this.quotaExceededHandler.execute(
          job as Job<EntitlementQuotaExceededJobData>,
        );

      case ENTITLEMENT_JOB_NAMES.TRIAL_EXPIRY_CHECK:
        return this.trialExpiryHandler.execute(
          job as Job<EntitlementTrialExpiryCheckJobData>,
        );

      default:
        throw new PermanentError(
          `No handler registered for job name="${job.name}" — ` +
            `register a handler in EntitlementQueueProcessor.handle().`,
        );
    }
  }

  protected onDeadLetter(job: Job<unknown>, error: Error): void {
    this.logger.error(
      `Job exhausted all retries — manual intervention may be needed. ` +
        `name=${job.name} id=${job.id} error=${error.message}`,
    );
  }
}

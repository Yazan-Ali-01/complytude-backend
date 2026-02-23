import {
  AbstractProcessor,
  ENTITLEMENT_JOB_NAMES,
  EntitlementProjectionUpdateJobData,
  Job,
  Processor,
  QUEUE_NAMES,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { ProjectionUpdateHandler } from '../processors/projection-update.handler';

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
    // Future handlers injected here:
    // private readonly snapshotRebuildHandler: SnapshotRebuildHandler,
    // private readonly domainEventFanoutHandler: DomainEventFanoutHandler,
    // private readonly creditEventHandler: CreditEventHandler,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case ENTITLEMENT_JOB_NAMES.PROJECTION_UPDATE:
        return this.projectionUpdateHandler.execute(
          job as Job<EntitlementProjectionUpdateJobData>,
        );

      // Future job handlers:
      // case ENTITLEMENT_JOB_NAMES.SNAPSHOT_REBUILD:
      //   return this.snapshotRebuildHandler.execute(job);
      // case ENTITLEMENT_JOB_NAMES.DOMAIN_EVENT_FANOUT:
      //   return this.domainEventFanoutHandler.execute(job);
      // case ENTITLEMENT_JOB_NAMES.CREDIT_EVENT:
      //   return this.creditEventHandler.execute(job);

      default:
        this.logger.warn(
          `No handler registered for job name="${job.name}" — ` +
            `register a handler in EntitlementQueueProcessor.handle(). ` +
            `Job will be marked complete without processing.`,
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

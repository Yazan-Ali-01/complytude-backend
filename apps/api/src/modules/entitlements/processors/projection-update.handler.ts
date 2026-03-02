import { EntitlementProjectionUpdateJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { UsageLedgerRepository } from '../../../repositories/usage/usage-ledger.repository';
import { DomainEventsService } from '../services/domain-events.service';
import { UsageProjectionService } from '../services/usage-projection.service';
import { buildUsageRecordedEvent } from '../utils/usage-event-payload.util';

/**
 * Projection Update Handler
 *
 * Handles PROJECTION_UPDATE jobs enqueued by EntitlementEnforcementService
 * after a usage ledger write commits.
 *
 * Responsibilities:
 * - Per-event idempotency via projected_at CAS on usage_ledger
 * - Atomically increment aggregated_usage counters
 * - Emit usage.recorded domain event with enforcement_mode: 'async'
 *
 * Idempotency: claimForProjection() atomically sets projected_at = NOW()
 * WHERE projected_at IS NULL. If 0 rows returned, this event was already
 * projected (BullMQ ACK loss → retry) — skip. Order-independent: works
 * correctly regardless of retry interleaving with other events.
 */
@Injectable()
export class ProjectionUpdateHandler {
  private readonly logger = new Logger(ProjectionUpdateHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usageProjectionService: UsageProjectionService,
    private readonly domainEventsService: DomainEventsService,
    private readonly usageLedgerRepository: UsageLedgerRepository,
  ) {}

  /**
   * Process a PROJECTION_UPDATE job
   *
   * @param job - BullMQ job containing EntitlementProjectionUpdateJobData
   */
  async execute(job: Job<EntitlementProjectionUpdateJobData>): Promise<void> {
    const data = job.data;

    await this.databaseService.transactionWithTenantContext(
      { tenantId: data.tenantId },
      async (client) => {
        // Per-event idempotency guard: atomically claim this event for projection.
        // Returns false if projected_at was already set — event already processed.
        const claimed = await this.usageLedgerRepository.claimForProjection(
          data.usageLedgerId,
          { client },
        );

        if (!claimed) {
          this.logger.warn(
            `Skipping already-projected event: ledger=${data.usageLedgerId} ` +
              `feature=${data.featureKey} tenant=${data.tenantId}`,
          );
          return;
        }

        // Update aggregated_usage projection
        await this.usageProjectionService.incrementUsage(
          {
            tenantId: data.tenantId,
            subscriptionId: data.subscriptionId,
            featureId: data.featureId,
            billingPeriod: data.billingPeriod,
            allocations: data.allocations,
          },
          { client },
        );

        // Emit usage.recorded domain event
        await this.domainEventsService.emit(
          buildUsageRecordedEvent(data, 'async', {
            job_id: job.id,
            attempt: job.attemptsMade + 1,
          }),
          { client },
        );
      },
    );
  }
}

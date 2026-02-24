import { EntitlementProjectionUpdateJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { AggregatedUsageRepository } from '../../../repositories/usage/aggregated-usage.repository';
import { DomainEventsService } from '../services/domain-events.service';
import { UsageProjectionService } from '../services/usage-projection.service';

/**
 * Projection Update Handler
 *
 * Handles PROJECTION_UPDATE jobs enqueued by EntitlementEnforcementService
 * after a usage ledger write commits.
 *
 * Responsibilities:
 * - Idempotency guard via last_event_id on aggregated_usage
 * - Atomically increment aggregated_usage counters
 * - Emit usage.recorded domain event with enforcement_mode: 'async'
 *
 * Idempotency: if the handler's transaction commits but BullMQ ACK is lost
 * (process crash between commit and ACK), the retry detects the duplicate
 * via aggregated_usage.last_event_id and skips re-processing.
 */
@Injectable()
export class ProjectionUpdateHandler {
  private readonly logger = new Logger(ProjectionUpdateHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usageProjectionService: UsageProjectionService,
    private readonly domainEventsService: DomainEventsService,
    private readonly aggregatedUsageRepository: AggregatedUsageRepository,
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
        // Idempotency guard: skip if this ledger event was already projected.
        // Protects against BullMQ ACK loss → retry after successful commit.
        const existing =
          await this.aggregatedUsageRepository.findBySubscriptionAndFeature(
            data.subscriptionId,
            data.featureId,
            { client },
          );

        if (existing?.last_event_id === data.usageLedgerId) {
          this.logger.warn(
            `Skipping duplicate projection: ledger=${data.usageLedgerId} ` +
              `feature=${data.featureKey} tenant=${data.tenantId}`,
          );
          return;
        }

        // Update aggregated_usage projection
        await this.usageProjectionService.incrementUsage(
          data.tenantId,
          data.subscriptionId,
          data.featureId,
          data.billingPeriod,
          data.allocations,
          data.usageLedgerId,
          { client },
        );

        // Emit usage.recorded domain event
        await this.domainEventsService.emit(
          {
            tenant_id: data.tenantId,
            event_type: 'usage.recorded',
            aggregate_type: 'usage',
            aggregate_id: data.usageLedgerId,
            actor_id: data.actorId,
            actor_type: data.actorId ? 'user' : 'system',
            payload: JSON.stringify({
              usage_event_id: data.usageLedgerId,
              feature_id: data.featureId,
              feature_key: data.featureKey,
              feature_name: data.featureName,
              feature_type: data.featureType,
              units: data.units,
              allocations: data.allocations,
              billing_period: data.billingPeriod,
              resource_type: data.resourceType,
              resource_id: data.resourceId,
              recorded_at: data.recordedAt,
              idempotency_key: data.idempotencyKey,
              enforcement_mode: 'async',
              credit_deducted: data.creditDeducted,
              credit_amount: data.creditAmount,
            }),
            metadata: JSON.stringify({
              job_id: job.id,
              attempt: job.attemptsMade + 1,
            }),
          },
          { client },
        );
      },
    );
  }
}

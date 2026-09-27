import { DatabaseService } from '@lib/database';
import { EntitlementUsageRefundJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { UsageLedgerRepository } from 'src/repositories/usage/usage-ledger.repository';
import { DomainEventsService } from '../services/domain-events.service';
import { UsageProjectionService } from '../services/usage-projection.service';
import { FeaturesRepository } from 'src/repositories/features/features.repository';

/**
 * Usage Refund Handler
 *
 * Processes USAGE_REFUND jobs emitted by workers when an async job (e.g., document
 * generation) fails permanently after its documents_per_month entitlement was already
 * deducted on the API side.
 *
 * Flow:
 * 1. Find the usage_ledger entry via resource_id (the failed job's ID)
 * 2. Void the entry (voided_at = NOW()) — excluded from future projections/reconciliation
 * 3. Rebuild aggregated_usage from the remaining non-voided ledger entries
 * 4. Emit a usage.refunded domain event for the audit trail
 *
 * Idempotency: if the ledger entry is already voided, step 2 returns false
 * and the handler short-circuits without re-rebuilding the projection.
 */
@Injectable()
export class UsageRefundHandler {
  private readonly logger = new Logger(UsageRefundHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usageLedgerRepository: UsageLedgerRepository,
    private readonly usageProjectionService: UsageProjectionService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly featuresRepository: FeaturesRepository,
    private readonly domainEventsService: DomainEventsService,
  ) {}

  async execute(job: Job<EntitlementUsageRefundJobData>): Promise<void> {
    const { tenantId, resourceId, resourceType, featureKey, units } = job.data;

    this.logger.log(
      `Processing usage refund: tenant=${tenantId} resource=${resourceType}/${resourceId} feature=${featureKey} units=${units}`,
    );

    await this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        // Step 1: Find the usage ledger entry to be refunded
        const ledgerEntry = await this.usageLedgerRepository.findByResourceId(
          resourceId,
          tenantId,
          { client },
        );

        if (!ledgerEntry) {
          this.logger.warn(
            `Usage refund skipped — no non-voided ledger entry found for resource_id=${resourceId} tenant=${tenantId}`,
          );
          return;
        }

        // Step 2: Void the entry (idempotent — returns false if already voided)
        const voided = await this.usageLedgerRepository.voidEntry(
          ledgerEntry.id,
          { client },
        );

        if (!voided) {
          this.logger.warn(
            `Usage refund skipped — ledger entry ${ledgerEntry.id} already voided`,
          );
          return;
        }

        this.logger.log(
          `Voided ledger entry ${ledgerEntry.id} for resource ${resourceId}`,
        );

        // Step 3: Rebuild the aggregated_usage projection from the remaining
        // non-voided ledger entries so quota enforcement reflects the refund.
        const subscription =
          await this.subscriptionsRepository.findActiveByTenant(tenantId, {
            client,
          });

        if (!subscription) {
          this.logger.error(
            `Usage refund cannot rebuild projection — no active subscription for tenant=${tenantId}`,
          );
          return;
        }

        await this.usageProjectionService.rebuildFromLedger(
          tenantId,
          subscription.id,
          ledgerEntry.feature_id,
          ledgerEntry.billing_period,
          { client },
        );

        this.logger.log(
          `Rebuilt projection after refund: tenant=${tenantId} feature=${ledgerEntry.feature_id} period=${ledgerEntry.billing_period}`,
        );

        // Step 4: Emit audit domain event
        await this.domainEventsService.emit(
          {
            event_type: 'usage.refunded',
            tenant_id: tenantId,
            aggregate_type: 'usage',
            aggregate_id: ledgerEntry.id,
            payload: JSON.stringify({
              ledger_entry_id: ledgerEntry.id,
              resource_id: resourceId,
              resource_type: resourceType,
              feature_key: featureKey,
              units_refunded: units,
              billing_period: ledgerEntry.billing_period,
              reason: 'async_job_permanent_failure',
            }),
          },
          { client },
        );
      },
    );

    this.logger.log(
      `Usage refund completed: tenant=${tenantId} resource=${resourceType}/${resourceId}`,
    );
  }
}

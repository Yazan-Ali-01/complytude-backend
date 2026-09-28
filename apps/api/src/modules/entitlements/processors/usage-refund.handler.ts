import { DatabaseService } from '@lib/database';
import { EntitlementUsageRefundJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { UsageLedgerRepository } from 'src/repositories/usage/usage-ledger.repository';
import { DomainEventsService } from '../services/domain-events.service';
import { AggregatedUsageRepository } from 'src/repositories/usage/aggregated-usage.repository';
import { UsageAllocationsRepository } from 'src/repositories/usage/usage-allocations.repository';
import { CreditLedgerRepository } from 'src/repositories/credits/credit-ledger.repository';
import { CreditLedgerService } from '../services/credit-ledger.service';

/**
 * Usage Refund Handler
 *
 * Processes USAGE_REFUND jobs emitted when an async job (e.g. document generation) fails
 * permanently after its usage was already recorded on the API side.
 *
 * Flow, in one tenant transaction:
 * 1. Find the usage_ledger entry by resource_id (the failed job's ID)
 * 2. Void it (voided_at = NOW()): excluded from projections, reconciliation and future claims
 * 3. If it was already projected, take its units back out of aggregated_usage. If not, its
 *    pending projection job now skips it.
 * 4. Refund the credits its deductions took (credit-funded overage)
 * 5. Emit a usage.refunded domain event for the audit trail
 *
 * Idempotency: voiding succeeds once, so a repeated job stops at step 2.
 */
@Injectable()
export class UsageRefundHandler {
  private readonly logger = new Logger(UsageRefundHandler.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usageLedgerRepository: UsageLedgerRepository,
    private readonly usageAllocationsRepository: UsageAllocationsRepository,
    private readonly aggregatedUsageRepository: AggregatedUsageRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly creditLedgerRepository: CreditLedgerRepository,
    private readonly creditLedgerService: CreditLedgerService,
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

        let projectionRestored = false;
        if (ledgerEntry.projected_at) {
          const [allocations, subscription] = await Promise.all([
            this.usageAllocationsRepository.findByUsageLedgerId(
              ledgerEntry.id,
              { client },
            ),
            this.subscriptionsRepository.findCurrentByTenant(tenantId, {
              client,
            }),
          ]);
          if (subscription) {
            projectionRestored = await this.aggregatedUsageRepository.decrement(
              {
                tenantId,
                subscriptionId: subscription.id,
                featureId: ledgerEntry.feature_id,
                billingPeriod: ledgerEntry.billing_period,
                allocations: allocations.flatMap((a) =>
                  a.source === 'mixed'
                    ? []
                    : [{ source: a.source, units: a.units }],
                ),
              },
              { client },
            );
          }
          if (!projectionRestored) {
            this.logger.warn(
              `Usage refund: no projection row to restore for tenant=${tenantId} feature=${ledgerEntry.feature_id}; reconciliation will correct it`,
            );
          }
        }

        const creditsToRefund =
          await this.creditLedgerRepository.sumDeductionsForUsage(
            ledgerEntry.id,
            { client },
          );
        if (creditsToRefund > 0) {
          await this.creditLedgerService.refund(
            {
              tenantId,
              amount: creditsToRefund,
              reason: 'async_job_permanent_failure',
              metadata: {
                usage_ledger_id: ledgerEntry.id,
                resource_id: resourceId,
                resource_type: resourceType,
              },
            },
            { client },
          );
        }

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
              units_refunded: ledgerEntry.units,
              credits_refunded: creditsToRefund,
              projection_restored: projectionRestored,
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

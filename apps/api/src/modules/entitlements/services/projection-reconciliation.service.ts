import { Injectable, Logger } from '@nestjs/common';
import { deriveBillingPeriod } from 'src/common/utils/billing.util';
import { DatabaseService } from 'src/database/database.service';
import { AggregatedUsageRepository } from 'src/repositories/usage/aggregated-usage.repository';
import { UsageProjectionService } from './usage-projection.service';

interface LedgerTotalsRow {
  tenant_id: string;
  feature_id: string;
  subscription_id: string;
  current_period_start: string;
  ledger_units: string;
}

export interface ReconciliationResult {
  checked: number;
  drifted: number;
  corrected: number;
  details: Array<{
    subscriptionId: string;
    featureId: string;
    projectionTotal: number;
    ledgerTotal: number;
    drift: number;
  }>;
}

/**
 * Detects and auto-corrects drift between aggregated_usage (projection) and
 * SUM(usage_allocations.units) (ledger truth) for the current billing period.
 *
 * Called manually (REPL, admin endpoint, future cron). Not triggered automatically.
 * See EPIC 7 for scheduled reconciliation.
 */
@Injectable()
export class ProjectionReconciliationService {
  private readonly logger = new Logger(ProjectionReconciliationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly aggregatedUsageRepository: AggregatedUsageRepository,
    private readonly usageProjectionService: UsageProjectionService,
  ) {}

  /**
   * Compare projections against ledger truth for the current billing period,
   * log any drift, and auto-correct using rebuildFromLedger().
   *
   * @param tenantId - Optional. If provided, only reconciles that tenant.
   *                   If omitted, reconciles all active subscriptions.
   */
  async reconcile(tenantId?: string): Promise<ReconciliationResult> {
    // Cross-tenant read
    const ledgerTotalsQuery = `
      SELECT
        ul.tenant_id,
        ul.feature_id,
        ts.id AS subscription_id,
        ts.current_period_start,
        SUM(ua.units) AS ledger_units
      FROM public.usage_ledger ul
      JOIN public.usage_allocations ua ON ua.usage_ledger_id = ul.id
      JOIN public.tenant_subscriptions ts
        ON ts.tenant_id = ul.tenant_id AND ts.status = 'active'
      WHERE ul.recorded_at >= ts.current_period_start
      ${tenantId ? 'AND ul.tenant_id = $1' : ''}
      GROUP BY ul.tenant_id, ul.feature_id, ts.id, ts.current_period_start
    `;

    const ledgerResult = await this.databaseService.query<LedgerTotalsRow>(
      ledgerTotalsQuery,
      tenantId ? [tenantId] : [],
    );

    let checked = 0;
    let drifted = 0;
    let corrected = 0;
    const details: ReconciliationResult['details'] = [];

    for (const row of ledgerResult.rows) {
      checked++;

      const ledgerTotal = parseInt(row.ledger_units, 10);

      // bypassRLS is default here — this is a reconciliation read, not tenant-scoped
      const projection =
        await this.aggregatedUsageRepository.findBySubscriptionAndFeature(
          row.subscription_id,
          row.feature_id,
        );
      const projectionTotal = projection?.total_units ?? 0;

      if (projectionTotal === ledgerTotal) {
        continue;
      }

      drifted++;
      const drift = ledgerTotal - projectionTotal;

      this.logger.warn(
        `[projection.drift_detected] subscription=${row.subscription_id} ` +
          `feature=${row.feature_id} tenant=${row.tenant_id} ` +
          `projection=${projectionTotal} ledger=${ledgerTotal} drift=${drift}`,
      );

      details.push({
        subscriptionId: row.subscription_id,
        featureId: row.feature_id,
        projectionTotal,
        ledgerTotal,
        drift,
      });

      const billingPeriod = deriveBillingPeriod(
        new Date(row.current_period_start),
      );

      // rebuildFromLedger writes to aggregated_usage (RLS-protected), so it
      // needs tenant context. Pass { client } so both the read and upsert inside
      // rebuildFromLedger share the same transaction.
      await this.databaseService.transactionWithTenantContext(
        { tenantId: row.tenant_id },
        async (client) => {
          await this.usageProjectionService.rebuildFromLedger(
            row.tenant_id,
            row.subscription_id,
            row.feature_id,
            billingPeriod,
            { client },
          );
        },
      );

      corrected++;

      this.logger.log(
        `[projection.drift_corrected] subscription=${row.subscription_id} ` +
          `feature=${row.feature_id} corrected from ${projectionTotal} to ${ledgerTotal}`,
      );
    }

    this.logger.log(
      `Reconciliation complete: checked=${checked} drifted=${drifted} corrected=${corrected}`,
    );

    return { checked, drifted, corrected, details };
  }
}

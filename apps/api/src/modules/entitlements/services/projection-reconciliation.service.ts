import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { deriveBillingPeriod } from 'src/common/utils/billing.util';
import { DatabaseService } from 'src/database/database.service';
import { AggregatedUsage } from 'src/common/types/entitlement.types';
import { AggregatedUsageRepository } from 'src/repositories/usage/aggregated-usage.repository';
import { UsageProjectionService } from './usage-projection.service';

// Raw rows returned by the per-source ledger totals query.
interface LedgerTotalsRow {
  tenant_id: string;
  feature_id: string;
  subscription_id: string;
  current_period_start: string;
  source: 'plan' | 'addon' | 'credit' | 'override';
  ledger_units: string;
}

// Accumulated expected totals per (subscription × feature), broken down by source.
interface ExpectedEntry {
  tenantId: string;
  subscriptionId: string;
  featureId: string;
  periodStart: string;
  planUnits: number;
  addonUnits: number;
  creditUnits: number;
  overrideUnits: number;
}

export interface ReconciliationResult {
  checked: number;
  drifted: number;
  corrected: number;
  /** Number of rows that failed to correct (exception thrown during rebuild). */
  failed: number;
  details: Array<{
    subscriptionId: string;
    featureId: string;
    projectionPlanUnits: number;
    projectionAddonUnits: number;
    projectionCreditUnits: number;
    projectionOverrideUnits: number;
    projectionTotal: number;
    ledgerPlanUnits: number;
    ledgerAddonUnits: number;
    ledgerCreditUnits: number;
    ledgerOverrideUnits: number;
    ledgerTotal: number;
    drift: number;
  }>;
  failedDetails: Array<{
    subscriptionId: string;
    featureId: string;
    error: string;
  }>;
}

/**
 * Detects and auto-corrects drift between aggregated_usage (projection) and
 * SUM(usage_allocations.units) (ledger truth) for the current billing period.
 *
 * Per-source comparison (plan / addon / credit / override) is used instead of
 * total-only so that cross-source drift (e.g., plan=5 addon=3 vs plan=4 addon=4,
 * same total of 8) is detected.
 *
 * Called manually (REPL, admin endpoint, future cron). Not triggered automatically.
 * See EPIC 7 for scheduled reconciliation.
 *
 * NOTE — Single-subscription-per-tenant invariant:
 * The ledger totals query joins tenant_subscriptions ON ts.tenant_id = ul.tenant_id
 * AND ts.status = 'active' without scoping to a specific subscription for a given
 * feature. This is correct only if each tenant has at most one active subscription
 * at a time. That invariant is enforced at subscription creation (a new subscription
 * is only created when there is no other active one for the tenant). If it is ever
 * relaxed, this query must be updated to scope by subscription_id.
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
   * log any per-source drift, and auto-correct using rebuildFromLedger().
   *
   * @param tenantId - Optional. If provided, only reconciles that tenant.
   *                   If omitted, reconciles all active subscriptions.
   */
  async reconcile(tenantId?: string): Promise<ReconciliationResult> {
    // ----------------------------------------------------------------
    // Phase 1 — Read ledger totals + current projections in one transaction.
    //
    // Cross-tenant: transactionWithPlatformAdminContext (sets app.platform_role)
    // Single-tenant: transactionWithTenantContext (scoped RLS)
    // ----------------------------------------------------------------
    const { expectedMap, projectionMap } = await this.withReadContext(
      tenantId,
      async (client) => {
        const ledgerResult = await this.fetchLedgerTotals(client, tenantId);

        // Aggregate per-source rows into per-(subscription × feature) entries.
        const expectedMap = new Map<string, ExpectedEntry>();
        for (const row of ledgerResult) {
          const key = `${row.subscription_id}:${row.feature_id}`;
          if (!expectedMap.has(key)) {
            expectedMap.set(key, {
              tenantId: row.tenant_id,
              subscriptionId: row.subscription_id,
              featureId: row.feature_id,
              periodStart: row.current_period_start,
              planUnits: 0,
              addonUnits: 0,
              creditUnits: 0,
              overrideUnits: 0,
            });
          }
          const entry = expectedMap.get(key)!;
          const units = parseInt(row.ledger_units, 10);
          if (row.source === 'plan') entry.planUnits += units;
          else if (row.source === 'addon') entry.addonUnits += units;
          else if (row.source === 'credit') entry.creditUnits += units;
          else if (row.source === 'override') entry.overrideUnits += units;
        }

        // Batch-fetch all aggregated_usage rows for the affected subscriptions.
        const subscriptionIds = [
          ...new Set([...expectedMap.values()].map((e) => e.subscriptionId)),
        ];
        const projections =
          await this.aggregatedUsageRepository.findBySubscriptionIds(
            subscriptionIds,
            { client },
          );
        const projectionMap = new Map<string, AggregatedUsage>(
          projections.map((p) => [`${p.subscription_id}:${p.feature_id}`, p]),
        );

        return { expectedMap, projectionMap };
      },
    );

    // ----------------------------------------------------------------
    // Phase 2 — Compare and collect drifted entries.
    // ----------------------------------------------------------------
    let checked = 0;
    let drifted = 0;
    let corrected = 0;
    let failed = 0;
    const details: ReconciliationResult['details'] = [];
    const failedDetails: ReconciliationResult['failedDetails'] = [];

    for (const [, expected] of expectedMap) {
      checked++;

      const projection = projectionMap.get(
        `${expected.subscriptionId}:${expected.featureId}`,
      );

      const projPlan = projection?.plan_units ?? 0;
      const projAddon = projection?.addon_units ?? 0;
      const projCredit = projection?.credit_units ?? 0;
      const projOverride = projection?.override_units ?? 0;
      const projTotal = projection?.total_units ?? 0;

      const ledgerTotal =
        expected.planUnits +
        expected.addonUnits +
        expected.creditUnits +
        expected.overrideUnits;

      // Per-source drift check: total match is not sufficient — cross-source
      // drift (same total, different breakdown) must also be caught.
      const hasDrift =
        projPlan !== expected.planUnits ||
        projAddon !== expected.addonUnits ||
        projCredit !== expected.creditUnits ||
        projOverride !== expected.overrideUnits;

      if (!hasDrift) continue;

      drifted++;
      const drift = ledgerTotal - projTotal;

      this.logger.warn(
        `[projection.drift_detected] subscription=${expected.subscriptionId} ` +
          `feature=${expected.featureId} tenant=${expected.tenantId} ` +
          `projection=(plan=${projPlan} addon=${projAddon} credit=${projCredit} override=${projOverride} total=${projTotal}) ` +
          `ledger=(plan=${expected.planUnits} addon=${expected.addonUnits} credit=${expected.creditUnits} override=${expected.overrideUnits} total=${ledgerTotal}) ` +
          `drift=${drift}`,
      );

      details.push({
        subscriptionId: expected.subscriptionId,
        featureId: expected.featureId,
        projectionPlanUnits: projPlan,
        projectionAddonUnits: projAddon,
        projectionCreditUnits: projCredit,
        projectionOverrideUnits: projOverride,
        projectionTotal: projTotal,
        ledgerPlanUnits: expected.planUnits,
        ledgerAddonUnits: expected.addonUnits,
        ledgerCreditUnits: expected.creditUnits,
        ledgerOverrideUnits: expected.overrideUnits,
        ledgerTotal,
        drift,
      });

      // ----------------------------------------------------------------
      // Phase 3 — Rebuild per drifted row (per-row error isolation).
      // rebuildFromLedger writes to aggregated_usage (RLS-protected), so it
      // needs tenant context. Each rebuild is its own transaction so a single
      // failure doesn't abort the whole reconciliation run.
      // ----------------------------------------------------------------
      try {
        const billingPeriod = deriveBillingPeriod(
          new Date(expected.periodStart),
        );

        await this.databaseService.transactionWithTenantContext(
          { tenantId: expected.tenantId },
          async (client) => {
            await this.usageProjectionService.rebuildFromLedger(
              expected.tenantId,
              expected.subscriptionId,
              expected.featureId,
              billingPeriod,
              { client },
            );
          },
        );

        corrected++;
        this.logger.log(
          `[projection.drift_corrected] subscription=${expected.subscriptionId} ` +
            `feature=${expected.featureId} corrected from total=${projTotal} to total=${ledgerTotal}`,
        );
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[projection.drift_correction_failed] subscription=${expected.subscriptionId} ` +
            `feature=${expected.featureId} error=${message}`,
          err instanceof Error ? err.stack : undefined,
        );
        failedDetails.push({
          subscriptionId: expected.subscriptionId,
          featureId: expected.featureId,
          error: message,
        });
      }
    }

    this.logger.log(
      `Reconciliation complete: checked=${checked} drifted=${drifted} ` +
        `corrected=${corrected} failed=${failed}`,
    );

    return { checked, drifted, corrected, failed, details, failedDetails };
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  /**
   * Execute the read phase in the appropriate RLS context:
   * - No tenantId → transactionWithPlatformAdminContext (cross-tenant)
   * - tenantId provided → transactionWithTenantContext (scoped)
   */
  private withReadContext<T>(
    tenantId: string | undefined,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (tenantId) {
      return this.databaseService.transactionWithTenantContext(
        { tenantId },
        callback,
      );
    }
    return this.databaseService.transactionWithPlatformAdminContext(callback);
  }

  /**
   * Fetch per-source ledger totals for the current billing period.
   * Groups by (tenant_id, feature_id, subscription_id, source) so the caller
   * can detect cross-source drift, not just total drift.
   */
  private async fetchLedgerTotals(
    client: PoolClient,
    tenantId?: string,
  ): Promise<LedgerTotalsRow[]> {
    // NOTE: The join on tenant_subscriptions assumes one active subscription
    // per tenant (see class-level JSDoc for full invariant documentation).
    const query = `
      SELECT
        ul.tenant_id,
        ul.feature_id,
        ts.id        AS subscription_id,
        ts.current_period_start,
        ua.source,
        SUM(ua.units) AS ledger_units
      FROM public.usage_ledger ul
      JOIN public.usage_allocations ua ON ua.usage_ledger_id = ul.id
      JOIN public.tenant_subscriptions ts
        ON ts.tenant_id = ul.tenant_id AND ts.status = 'active'
      WHERE ul.recorded_at >= ts.current_period_start
      ${tenantId ? 'AND ul.tenant_id = $1' : ''}
      GROUP BY ul.tenant_id, ul.feature_id, ts.id, ts.current_period_start, ua.source
    `;
    const result = await client.query<LedgerTotalsRow>(
      query,
      tenantId ? [tenantId] : [],
    );
    return result.rows;
  }
}

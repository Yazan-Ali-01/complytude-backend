import { BaseRepository, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  AggregatedUsage,
  CreateAggregatedUsageRow,
  UpdateAggregatedUsageRow,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';

type AggregatedUsageRow = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  feature_id: string;
  billing_period: string;
  total_units: number;
  plan_units: number;
  addon_units: number;
  credit_units: number;
  override_units: number;
  last_updated_at: Date;
};

/**
 * Repository for managing Aggregated Usage projections.
 * Derived from usage_ledger (not source of truth).
 *
 * Note: This is a stub for Phase 3.
 */
@Injectable()
export class AggregatedUsageRepository extends BaseRepository<
  AggregatedUsage,
  CreateAggregatedUsageRow,
  UpdateAggregatedUsageRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.aggregated_usage');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, subscription_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units, last_updated_at';
  }

  protected mapRow(row: Record<string, unknown>): AggregatedUsage {
    const data = row as AggregatedUsageRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      subscription_id: data.subscription_id,
      feature_id: data.feature_id,
      billing_period: data.billing_period,
      total_units: data.total_units,
      plan_units: data.plan_units,
      addon_units: data.addon_units,
      credit_units: data.credit_units,
      override_units: data.override_units,
      last_updated_at: data.last_updated_at,
    };
  }

  /**
   * Get distinct subscription IDs that have aggregated_usage rows.
   * Used for orphan detection — find subscriptions with projections but no ledger.
   *
   * @param tenantId - Optional. If provided, only return subscriptions for this tenant.
   */
  async findSubscriptionIdsWithProjections(
    tenantId?: string,
    options?: QueryOptions,
  ): Promise<string[]> {
    const conditions = tenantId ? ['tenant_id = $1'] : [];
    const params = tenantId ? [tenantId] : [];
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.executeQuery<{ subscription_id: string }>(
      `SELECT DISTINCT subscription_id FROM ${this.tableName} ${whereClause}`,
      params,
      options,
    );
    return result.rows.map((r) => r.subscription_id);
  }

  /**
   * Batch-fetch all aggregated usage rows for a set of subscription IDs.
   * Used by ProjectionReconciliationService to avoid N+1 queries.
   */
  async findBySubscriptionIds(
    subscriptionIds: string[],
    options?: QueryOptions,
  ): Promise<AggregatedUsage[]> {
    if (subscriptionIds.length === 0) return [];
    const result = await this.executeQuery<AggregatedUsageRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE subscription_id = ANY($1)`,
      [subscriptionIds],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find aggregated usage row by subscription and feature.
   * Used by ProjectionReconciliationService for drift detection.
   *
   * @param subscriptionId - Subscription ID
   * @param featureId - Feature UUID
   * @param options - Query options
   */
  async findBySubscriptionAndFeature(
    subscriptionId: string,
    featureId: string,
    options?: QueryOptions,
  ): Promise<AggregatedUsage | null> {
    const result = await this.executeQuery(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE subscription_id = $1 AND feature_id = $2`,
      [subscriptionId, featureId],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find current usage for tenant, subscription, and feature
   * Phase 3 implementation (updated to use subscription_id)
   */
  async findCurrent(
    tenantId: string,
    subscriptionId: string,
    featureKey: string,
    options?: QueryOptions,
  ): Promise<AggregatedUsage | null> {
    const query = `
      SELECT ${this.getSelectColumns()
        .split(', ')
        .map((col) => `au.${col}`)
        .join(', ')}
      FROM ${this.tableName} au
      JOIN public.features f ON f.id = au.feature_id
      WHERE au.tenant_id = $1 AND au.subscription_id = $2 AND f.key = $3
    `;

    const result = await this.executeQuery(
      query,
      [tenantId, subscriptionId, featureKey],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Upsert aggregated usage
   * Phase 3 implementation (updated to use subscription_id)
   */
  async upsert(
    usage: CreateAggregatedUsageRow,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    const result = await this.executeQuery<AggregatedUsageRow>(
      `
      INSERT INTO ${this.tableName} (tenant_id, subscription_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (subscription_id, feature_id) DO UPDATE SET
        total_units = EXCLUDED.total_units,
        plan_units = EXCLUDED.plan_units,
        addon_units = EXCLUDED.addon_units,
        credit_units = EXCLUDED.credit_units,
        override_units = EXCLUDED.override_units,
        last_updated_at = now()
      RETURNING ${this.getSelectColumns()}
      `,
      [
        usage.tenant_id,
        usage.subscription_id,
        usage.feature_id,
        usage.billing_period,
        usage.total_units ?? 0,
        usage.plan_units ?? 0,
        usage.addon_units ?? 0,
        usage.credit_units ?? 0,
        usage.override_units ?? 0,
      ],
      options,
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Atomically increment usage counters with multi-source allocations
   * Phase 3 implementation (updated to use subscription_id and allocations)
   *
   * This method performs atomic increments to prevent race conditions
   * when multiple requests record usage simultaneously.
   *
   * Using subscription_id ensures:
   * - Each billing period gets its own projection (unambiguous)
   * - Quota enforcement checks the correct subscription
   * - Works for any billing cycle (monthly, yearly, custom)
   *
   * @param tenantId - Tenant ID
   * @param subscriptionId - Subscription ID
   * @param featureId - Feature UUID
   * @param billingPeriod - Billing period (YYYY-MM format)
   * @param allocations - Array of { source, units } allocations
   * @param eventId - Usage ledger event ID
   * @param options - Query options
   * @returns Updated aggregated usage
   */
  async increment(
    tenantId: string,
    subscriptionId: string,
    featureId: string,
    billingPeriod: string,
    allocations: Array<{
      source: 'plan' | 'addon' | 'credit' | 'override';
      units: number;
    }>,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    // Compute deltas from allocations
    const totalUnits = allocations.reduce((sum, a) => sum + a.units, 0);
    const planUnits = allocations
      .filter((a) => a.source === 'plan')
      .reduce((sum, a) => sum + a.units, 0);
    const addonUnits = allocations
      .filter((a) => a.source === 'addon')
      .reduce((sum, a) => sum + a.units, 0);
    const creditUnits = allocations
      .filter((a) => a.source === 'credit')
      .reduce((sum, a) => sum + a.units, 0);
    const overrideUnits = allocations
      .filter((a) => a.source === 'override')
      .reduce((sum, a) => sum + a.units, 0);

    const result = await this.executeQuery<AggregatedUsageRow>(
      `
      INSERT INTO ${this.tableName} (tenant_id, subscription_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (subscription_id, feature_id) DO UPDATE SET
        total_units = ${this.tableName}.total_units + $5,
        plan_units = ${this.tableName}.plan_units + $6,
        addon_units = ${this.tableName}.addon_units + $7,
        credit_units = ${this.tableName}.credit_units + $8,
        override_units = ${this.tableName}.override_units + $9,
        last_updated_at = now()
      RETURNING ${this.getSelectColumns()}
      `,
      [
        tenantId,
        subscriptionId,
        featureId,
        billingPeriod,
        totalUnits,
        planUnits,
        addonUnits,
        creditUnits,
        overrideUnits,
      ],
      options,
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Atomically increment usage counters with a quota guard (CAS).
   *
   * Uses ON CONFLICT DO UPDATE ... WHERE total_units + delta <= limit.
   * Returns null when the guarded UPDATE path fails (0 rows), which indicates
   * another concurrent request consumed the remaining quota.
   */
  async conditionalIncrement(
    tenantId: string,
    subscriptionId: string,
    featureId: string,
    billingPeriod: string,
    allocations: Array<{
      source: 'plan' | 'addon' | 'credit' | 'override';
      units: number;
    }>,
    limit: number,
    options?: QueryOptions,
  ): Promise<AggregatedUsage | null> {
    const totalUnits = allocations.reduce((sum, a) => sum + a.units, 0);
    const planUnits = allocations
      .filter((a) => a.source === 'plan')
      .reduce((sum, a) => sum + a.units, 0);
    const addonUnits = allocations
      .filter((a) => a.source === 'addon')
      .reduce((sum, a) => sum + a.units, 0);
    const creditUnits = allocations
      .filter((a) => a.source === 'credit')
      .reduce((sum, a) => sum + a.units, 0);
    const overrideUnits = allocations
      .filter((a) => a.source === 'override')
      .reduce((sum, a) => sum + a.units, 0);

    const result = await this.executeQuery<AggregatedUsageRow>(
      `
      INSERT INTO ${this.tableName} (tenant_id, subscription_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (subscription_id, feature_id) DO UPDATE SET
        total_units = ${this.tableName}.total_units + $5,
        plan_units = ${this.tableName}.plan_units + $6,
        addon_units = ${this.tableName}.addon_units + $7,
        credit_units = ${this.tableName}.credit_units + $8,
        override_units = ${this.tableName}.override_units + $9,
        last_updated_at = now()
      WHERE ${this.tableName}.plan_units + $6 <= $10
      RETURNING ${this.getSelectColumns()}
      `,
      [
        tenantId,
        subscriptionId,
        featureId,
        billingPeriod,
        totalUnits,
        planUnits,
        addonUnits,
        creditUnits,
        overrideUnits,
        limit,
      ],
      options,
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }
}

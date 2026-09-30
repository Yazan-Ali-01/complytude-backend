import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  AggregatedUsage,
  ConditionalIncrementInput,
  CreateAggregatedUsageRow,
  IncrementUsageInput,
  UpdateAggregatedUsageRow,
} from 'src/common/types/entitlement.types';
import { billingPeriodSql } from 'src/common/utils/billing.util';

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
 * Derived from usage_ledger (not source of truth). One row per subscription, feature and billing
 * period (`deriveBillingPeriod`): a new period starts from zero.
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

  /** Rows of each subscription's current billing period (its `current_period_start`). */
  private readonly currentPeriodJoin = `JOIN public.tenant_subscriptions ts
       ON ts.id = au.subscription_id
      AND au.billing_period = ${billingPeriodSql('ts.current_period_start')}`;

  /**
   * Distinct subscription IDs with a projection row in their current period.
   * Used for orphan detection — find subscriptions with projections but no ledger. Rows of past
   * periods are history, not orphans.
   *
   * @param tenantId - Optional. If provided, only return subscriptions for this tenant.
   */
  async findSubscriptionIdsWithProjections(
    tenantId?: string,
    options?: QueryOptions,
  ): Promise<string[]> {
    const result = await this.executeQuery<{ subscription_id: string }>(
      `SELECT DISTINCT au.subscription_id
       FROM ${this.tableName} au ${this.currentPeriodJoin}
       ${tenantId ? 'WHERE au.tenant_id = $1' : ''}`,
      tenantId ? [tenantId] : [],
      options,
    );
    return result.rows.map((r) => r.subscription_id);
  }

  /**
   * Batch-fetch the current-period projection rows of a set of subscriptions.
   * Used by ProjectionReconciliationService to avoid N+1 queries.
   */
  async findCurrentPeriodBySubscriptionIds(
    subscriptionIds: string[],
    options?: QueryOptions,
  ): Promise<AggregatedUsage[]> {
    if (subscriptionIds.length === 0) return [];
    const columns = this.getSelectColumns()
      .split(', ')
      .map((col) => `au.${col}`)
      .join(', ');
    const result = await this.executeQuery<AggregatedUsageRow>(
      `SELECT ${columns} FROM ${this.tableName} au ${this.currentPeriodJoin}
       WHERE au.subscription_id = ANY($1)`,
      [subscriptionIds],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** Usage of a feature in one billing period of a subscription (null: none recorded yet). */
  async findCurrent(
    tenantId: string,
    subscriptionId: string,
    featureKey: string,
    billingPeriod: string,
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
        AND au.billing_period = $4
    `;

    const result = await this.executeQuery(
      query,
      [tenantId, subscriptionId, featureKey, billingPeriod],
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
      ON CONFLICT (subscription_id, feature_id, billing_period) DO UPDATE SET
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
   * Keyed by subscription, feature and billing period, so each period gets its own counters.
   *
   * @param tenantId - Tenant ID
   * @param subscriptionId - Subscription ID
   * @param featureId - Feature UUID
   * @param billingPeriod - Billing period key (`deriveBillingPeriod`)
   * @param allocations - Array of { source, units } allocations
   * @param eventId - Usage ledger event ID
   * @param options - Query options
   * @returns Updated aggregated usage
   */
  async increment(
    input: IncrementUsageInput,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    const { tenantId, subscriptionId, featureId, billingPeriod, allocations } =
      input;
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
      ON CONFLICT (subscription_id, feature_id, billing_period) DO UPDATE SET
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
  /**
   * Take refunded units back out of the projection row of the period they were used in (never
   * below zero). Unlike `increment`, it never creates a row. Returns whether a row was updated.
   */
  async decrement(
    input: IncrementUsageInput,
    options?: QueryOptions,
  ): Promise<boolean> {
    const units = (source: string): number =>
      input.allocations
        .filter((a) => a.source === source)
        .reduce((sum, a) => sum + a.units, 0);
    const total = input.allocations.reduce((sum, a) => sum + a.units, 0);
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} SET
         total_units = GREATEST(total_units - $3, 0),
         plan_units = GREATEST(plan_units - $4, 0),
         addon_units = GREATEST(addon_units - $5, 0),
         credit_units = GREATEST(credit_units - $6, 0),
         override_units = GREATEST(override_units - $7, 0),
         last_updated_at = now()
       WHERE subscription_id = $1 AND feature_id = $2 AND billing_period = $8`,
      [
        input.subscriptionId,
        input.featureId,
        total,
        units('plan'),
        units('addon'),
        units('credit'),
        units('override'),
        input.billingPeriod,
      ],
      options,
    );
    return (result.rowCount ?? 0) > 0;
  }

  async conditionalIncrement(
    input: ConditionalIncrementInput,
    options?: QueryOptions,
  ): Promise<AggregatedUsage | null> {
    const {
      tenantId,
      subscriptionId,
      featureId,
      billingPeriod,
      allocations,
      limit,
    } = input;
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
      ON CONFLICT (subscription_id, feature_id, billing_period) DO UPDATE SET
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

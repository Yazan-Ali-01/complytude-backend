import { Injectable } from '@nestjs/common';
import {
  AggregatedUsage,
  CreateAggregatedUsageRow,
  IncrementAggregatedUsageInput,
  UpdateAggregatedUsageRow,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';

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
  last_event_id: string | null;
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
    return 'id, tenant_id, subscription_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units, last_event_id, last_updated_at';
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
      last_event_id: data.last_event_id ?? undefined,
      last_updated_at: data.last_updated_at,
    };
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
      INSERT INTO ${this.tableName} (tenant_id, subscription_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units, last_event_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (subscription_id, feature_id) DO UPDATE SET
        total_units = EXCLUDED.total_units,
        plan_units = EXCLUDED.plan_units,
        addon_units = EXCLUDED.addon_units,
        credit_units = EXCLUDED.credit_units,
        override_units = EXCLUDED.override_units,
        last_event_id = EXCLUDED.last_event_id,
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
        usage.last_event_id ?? null,
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
    input: IncrementAggregatedUsageInput,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    const {
      tenantId,
      subscriptionId,
      featureId,
      billingPeriod,
      allocations,
      eventId,
    } = input;
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
      INSERT INTO ${this.tableName} (tenant_id, subscription_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units, last_event_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (subscription_id, feature_id) DO UPDATE SET
        total_units = ${this.tableName}.total_units + $5,
        plan_units = ${this.tableName}.plan_units + $6,
        addon_units = ${this.tableName}.addon_units + $7,
        credit_units = ${this.tableName}.credit_units + $8,
        override_units = ${this.tableName}.override_units + $9,
        last_event_id = $10,
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
        eventId,
      ],
      options,
    );

    return this.mapRow(result.rows[0]);
  }
}

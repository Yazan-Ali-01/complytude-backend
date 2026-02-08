import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';
import {
  AggregatedUsage,
  CreateAggregatedUsageRow,
  UpdateAggregatedUsageRow,
} from 'src/common/types/entitlement.types';

type AggregatedUsageRow = {
  id: string;
  tenant_id: string;
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
    return 'id, tenant_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units, last_event_id, last_updated_at';
  }

  protected mapRow(row: Record<string, unknown>): AggregatedUsage {
    const data = row as AggregatedUsageRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
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
   * Find current usage for tenant and feature
   * Phase 3 implementation
   */
  async findCurrent(
    tenantId: string,
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
      WHERE au.tenant_id = $1 AND f.key = $2 AND au.billing_period = $3
    `;

    const result = await this.executeQuery(
      query,
      [tenantId, featureKey, billingPeriod],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Upsert aggregated usage
   * Phase 3 implementation
   */
  async upsert(
    usage: CreateAggregatedUsageRow,
    options?: QueryOptions,
  ): Promise<AggregatedUsage> {
    const result = await this.executeQuery<AggregatedUsageRow>(
      `
      INSERT INTO ${this.tableName} (tenant_id, feature_id, billing_period, total_units, plan_units, addon_units, credit_units, override_units, last_event_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, feature_id, billing_period) DO UPDATE SET
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
}

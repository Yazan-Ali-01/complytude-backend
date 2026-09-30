import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreateUsageAllocationRow,
  UsageAllocation,
} from 'src/common/types/entitlement.types';

type UsageAllocationRow = {
  id: string;
  usage_ledger_id: string;
  source: string;
  units: number;
  created_at: Date;
};

/**
 * Repository for managing Usage Allocations (append-only).
 * Per-source funding breakdown for usage events.
 *
 * Each usage_ledger event has 1..N allocations that sum to usage_ledger.units.
 */
@Injectable()
export class UsageAllocationsRepository extends BaseRepository<
  UsageAllocation,
  CreateUsageAllocationRow,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.usage_allocations');
  }

  protected getSelectColumns(): string {
    return 'id, usage_ledger_id, source, units, created_at';
  }

  protected mapRow(row: Record<string, unknown>): UsageAllocation {
    const data = row as UsageAllocationRow;
    return {
      id: data.id,
      usage_ledger_id: data.usage_ledger_id,
      source: data.source as UsageAllocation['source'],
      units: data.units,
      created_at: data.created_at,
    };
  }

  /**
   * Record multiple allocations for a usage event (bulk insert)
   *
   * @param allocations - Array of allocations to insert
   * @param options - Query options
   * @returns Array of recorded allocations
   */
  async recordAllocations(
    allocations: CreateUsageAllocationRow[],
    options?: QueryOptions,
  ): Promise<UsageAllocation[]> {
    if (allocations.length === 0) {
      return [];
    }

    // Build bulk insert query
    const values: unknown[] = [];
    const valuePlaceholders: string[] = [];
    let paramIndex = 1;

    for (const allocation of allocations) {
      valuePlaceholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`,
      );
      values.push(
        allocation.usage_ledger_id,
        allocation.source,
        allocation.units,
      );
      paramIndex += 3;
    }

    const query = `
      INSERT INTO ${this.tableName} (usage_ledger_id, source, units)
      VALUES ${valuePlaceholders.join(', ')}
      RETURNING ${this.getSelectColumns()}
    `;

    const result = await this.executeQuery<UsageAllocationRow>(
      query,
      values,
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all allocations for a specific usage event
   *
   * @param usageLedgerId - Usage ledger event ID
   * @param options - Query options
   * @returns Array of allocations
   */
  async findByUsageLedgerId(
    usageLedgerId: string,
    options?: QueryOptions,
  ): Promise<UsageAllocation[]> {
    const result = await this.executeQuery<UsageAllocationRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE usage_ledger_id = $1
       ORDER BY created_at ASC`,
      [usageLedgerId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all allocations for a tenant, feature, and billing period
   * Used for projection rebuild
   *
   * @param tenantId - Tenant ID
   * @param featureId - Feature UUID
   * @param billingPeriod - Billing period key (`deriveBillingPeriod`)
   * @param options - Query options
   * @returns Array of allocations with usage_ledger_id
   */
  async findByTenantFeaturePeriod(
    tenantId: string,
    featureId: string,
    billingPeriod: string,
    options?: QueryOptions,
  ): Promise<UsageAllocation[]> {
    const result = await this.executeQuery<UsageAllocationRow>(
      `SELECT ua.${this.getSelectColumns()
        .split(', ')
        .map((col) => col)
        .join(', ua.')}
       FROM ${this.tableName} ua
       JOIN public.usage_ledger ul ON ul.id = ua.usage_ledger_id
       WHERE ul.tenant_id = $1
         AND ul.feature_id = $2
         AND ul.billing_period = $3
         AND ul.voided_at IS NULL
       ORDER BY ul.recorded_at ASC, ua.created_at ASC`,
      [tenantId, featureId, billingPeriod],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  // Override update/delete to prevent usage (immutable ledger)
  update(): Promise<never> {
    throw new Error(
      'Usage allocations are immutable. UPDATE operations are not allowed.',
    );
  }

  delete(): Promise<never> {
    throw new Error(
      'Usage allocations are immutable. DELETE operations are not allowed.',
    );
  }
}

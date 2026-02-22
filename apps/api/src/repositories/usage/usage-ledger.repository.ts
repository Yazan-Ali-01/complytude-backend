import { Injectable } from '@nestjs/common';
import {
  CreateUsageLedgerRow,
  UsageLedgerEvent,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';

type UsageLedgerRow = {
  id: string;
  tenant_id: string;
  feature_id: string;
  user_id: string | null;
  units: number;
  billing_period: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: unknown;
  idempotency_key: string | null;
  recorded_at: Date;
};

/**
 * Repository for managing Usage Ledger events (append-only).
 * Source of truth for usage tracking.
 *
 * Note: This is a stub for Phase 3. No UPDATE or DELETE methods.
 */
@Injectable()
export class UsageLedgerRepository extends BaseRepository<
  UsageLedgerEvent,
  CreateUsageLedgerRow,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.usage_ledger');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, feature_id, user_id, units, billing_period, resource_type, resource_id, metadata, idempotency_key, recorded_at';
  }

  protected mapRow(row: Record<string, unknown>): UsageLedgerEvent {
    const data = row as UsageLedgerRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      feature_id: data.feature_id,
      user_id: data.user_id ?? undefined,
      units: data.units,
      billing_period: data.billing_period,
      resource_type: data.resource_type ?? undefined,
      resource_id: data.resource_id ?? undefined,
      metadata: (data.metadata as Record<string, any>) ?? {},
      idempotency_key: data.idempotency_key ?? undefined,
      recorded_at: data.recorded_at,
    };
  }

  /**
   * Record usage event (append-only)
   * Phase 3 implementation
   */
  async record(
    event: CreateUsageLedgerRow,
    options?: QueryOptions,
  ): Promise<UsageLedgerEvent> {
    return this.create(event, options);
  }

  /**
   * Find all usage events for a tenant, feature, and billing period
   * Phase 3 implementation - used for projection rebuild
   */
  async findByTenantFeaturePeriod(
    tenantId: string,
    featureId: string,
    billingPeriod: string,
    options?: QueryOptions,
  ): Promise<UsageLedgerEvent[]> {
    const result = await this.executeQuery<UsageLedgerRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE tenant_id = $1 AND feature_id = $2 AND billing_period = $3
       ORDER BY recorded_at ASC`,
      [tenantId, featureId, billingPeriod],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  // Override update/delete to prevent usage (immutable ledger)
  update(): Promise<never> {
    throw new Error(
      'Usage ledger is immutable. UPDATE operations are not allowed.',
    );
  }

  delete(): Promise<never> {
    throw new Error(
      'Usage ledger is immutable. DELETE operations are not allowed.',
    );
  }
}

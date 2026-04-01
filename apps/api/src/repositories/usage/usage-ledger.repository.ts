import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreateUsageLedgerRow,
  UsageLedgerEvent,
} from 'src/common/types/entitlement.types';

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
  projected_at: Date | null;
  voided_at: Date | null;
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
    return 'id, tenant_id, feature_id, user_id, units, billing_period, resource_type, resource_id, metadata, idempotency_key, recorded_at, projected_at, voided_at';
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
      metadata: (data.metadata as Record<string, unknown>) ?? {},
      idempotency_key: data.idempotency_key ?? undefined,
      recorded_at: data.recorded_at,
      projected_at: data.projected_at ?? undefined,
      voided_at: data.voided_at ?? undefined,
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
   * Find all non-voided usage events for a tenant, feature, and billing period.
   * Voided entries (voided_at IS NOT NULL) are excluded — they should not contribute
   * to projections or reconciliation.
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
         AND voided_at IS NULL
       ORDER BY recorded_at ASC`,
      [tenantId, featureId, billingPeriod],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find a usage event by resource_id (e.g., a generation job ID).
   * Returns the most recent non-voided entry for the given resource.
   * Used by the usage refund handler to locate the entry to void.
   */
  async findByResourceId(
    resourceId: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<UsageLedgerEvent | null> {
    const result = await this.executeQuery<UsageLedgerRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE resource_id = $1 AND tenant_id = $2 AND voided_at IS NULL
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [resourceId, tenantId],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Void a usage ledger entry (set voided_at = NOW()).
   * This is a one-time operation — once voided, the entry is excluded from
   * projections and reconciliation but remains in the ledger for audit purposes.
   *
   * Returns true if the void succeeded (entry existed and was not already voided).
   * Returns false if the entry was already voided or not found.
   */
  async voidEntry(ledgerId: string, options?: QueryOptions): Promise<boolean> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} SET voided_at = NOW() WHERE id = $1 AND voided_at IS NULL RETURNING id`,
      [ledgerId],
      options,
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Atomically claim a ledger event for projection (CAS idempotency guard).
   *
   * Sets projected_at = NOW() only if it is currently NULL.
   * Returns true if the claim succeeded (this call owns projection for this event).
   * Returns false if projected_at was already set — event was already projected, skip.
   *
   * This is the idempotency mechanism for ProjectionUpdateHandler and the sync fallback.
   * Because projected_at lives on the event itself (not on aggregated_usage), it is
   * order-independent: any retry order produces correct results.
   */
  async claimForProjection(
    ledgerId: string,
    options?: QueryOptions,
  ): Promise<boolean> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} SET projected_at = NOW() WHERE id = $1 AND projected_at IS NULL RETURNING id`,
      [ledgerId],
      options,
    );
    return (result.rowCount ?? 0) > 0;
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

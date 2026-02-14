import { Injectable } from '@nestjs/common';
import {
  CreateEntitlementSnapshotRow,
  EntitlementSnapshot,
  UpdateEntitlementSnapshotRow,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';

type EntitlementSnapshotRow = {
  id: string;
  tenant_id: string;
  snapshot_data: unknown;
  subscription_id: string | null;
  valid_from: Date;
  invalidated_at: Date | null;
  created_at: Date;
};

/**
 * Repository for managing Entitlement Snapshot entities.
 * Cached effective entitlements for performance.
 *
 * Note: This is a stub for Phase 8.
 */
@Injectable()
export class EntitlementSnapshotsRepository extends BaseRepository<
  EntitlementSnapshot,
  CreateEntitlementSnapshotRow,
  UpdateEntitlementSnapshotRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.entitlement_snapshots');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, snapshot_data, subscription_id, valid_from, invalidated_at, created_at';
  }

  protected mapRow(row: Record<string, unknown>): EntitlementSnapshot {
    const data = row as EntitlementSnapshotRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      snapshot_data: (data.snapshot_data as Record<string, any>) ?? {},
      subscription_id: data.subscription_id ?? undefined,
      valid_from: data.valid_from,
      invalidated_at: data.invalidated_at ?? undefined,
      created_at: data.created_at,
    };
  }

  /**
   * Find active snapshot for a tenant
   * Phase 8 implementation
   */
  async findActive(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<EntitlementSnapshot | null> {
    const result = await this.executeQuery<EntitlementSnapshotRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} 
       WHERE tenant_id = $1 AND invalidated_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Invalidate current snapshot for a tenant
   * Phase 8 implementation
   */
  async invalidate(tenantId: string, options?: QueryOptions): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET invalidated_at = now() 
       WHERE tenant_id = $1 AND invalidated_at IS NULL`,
      [tenantId],
      options,
    );
  }

  /**
   * Find snapshot history for a tenant (active + invalidated)
   * Phase 8 implementation
   */
  async findHistory(
    tenantId: string,
    limit: number = 10,
    options?: QueryOptions,
  ): Promise<EntitlementSnapshot[]> {
    const result = await this.executeQuery<EntitlementSnapshotRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} 
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Count active snapshots for a tenant (should always be 0 or 1)
   * Phase 8 implementation
   */
  async countActive(tenantId: string, options?: QueryOptions): Promise<number> {
    const result = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} 
       WHERE tenant_id = $1 AND invalidated_at IS NULL`,
      [tenantId],
      options,
    );

    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}

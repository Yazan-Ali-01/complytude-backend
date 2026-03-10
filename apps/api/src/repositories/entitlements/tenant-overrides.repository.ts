import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreateTenantOverrideRow,
  FeatureKey,
  FeatureType,
  TenantOverride,
  UpdateTenantOverrideRow,
} from 'src/common/types/entitlement.types';

type TenantOverrideRow = {
  id: string;
  tenant_id: string;
  feature_id: string;
  feature_key?: string; // Optional for queries that JOIN with features table
  feature_type?: string; // Optional for queries that JOIN with features table
  value_bool: boolean | null;
  value_int: number | null;
  value_text: string | null;
  reason: string;
  applied_by: string;
  starts_at: Date;
  expires_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Tenant Override entities.
 * Admin-applied entitlement overrides (rare, for special cases).
 */
@Injectable()
export class TenantOverridesRepository extends BaseRepository<
  TenantOverride,
  CreateTenantOverrideRow,
  UpdateTenantOverrideRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.tenant_overrides');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, feature_id, value_bool, value_int, value_text, reason, applied_by, starts_at, expires_at, is_active, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): TenantOverride {
    const data = row as TenantOverrideRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      feature_id: data.feature_id,
      feature_key: data.feature_key as FeatureKey, // Safe: queries JOIN with features table (validated by FK constraint)
      feature_type: data.feature_type as FeatureType, // Safe: queries JOIN with features table (validated by FK constraint)
      value_bool: data.value_bool ?? undefined,
      value_int: data.value_int ?? undefined,
      value_text: data.value_text ?? undefined,
      reason: data.reason,
      applied_by: data.applied_by,
      starts_at: data.starts_at,
      expires_at: data.expires_at ?? undefined,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Find all active overrides for a tenant (with feature_key JOIN)
   *
   * Returns only the newest override per feature using DISTINCT ON.
   * This ensures correct precedence: newest override wins.
   */
  async findActiveByTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantOverride[]> {
    const query = `
      SELECT DISTINCT ON (f.key)
        tor.id, tor.tenant_id, tor.feature_id, tor.value_bool, tor.value_int,
        tor.value_text, tor.reason, tor.applied_by, tor.starts_at, tor.expires_at,
        tor.is_active, tor.created_at, tor.updated_at,
        f.key as feature_key, f.feature_type
      FROM ${this.tableName} tor
      JOIN public.features f ON f.id = tor.feature_id
      WHERE tor.tenant_id = $1 AND tor.is_active = true
        AND (tor.expires_at IS NULL OR tor.expires_at > now())
      ORDER BY f.key, tor.created_at DESC
    `;

    const result = await this.executeQuery<TenantOverrideRow>(
      query,
      [tenantId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find active override for a specific feature (JOIN to avoid N+1)
   */
  async findActiveByTenantAndFeature(
    tenantId: string,
    featureKey: string,
    options?: QueryOptions,
  ): Promise<TenantOverride | null> {
    const query = `
    SELECT ${this.getSelectColumns()
      .split(', ')
      .map((col) => `tor.${col}`)
      .join(', ')}, f.key as feature_key, f.feature_type
    FROM ${this.tableName} tor
    JOIN public.features f ON f.id = tor.feature_id
    WHERE tor.tenant_id = $1 AND tor.is_active = true
      AND (tor.expires_at IS NULL OR tor.expires_at > now())
      AND f.key = $2
    ORDER BY tor.created_at DESC
    LIMIT 1
  `;

    const result = await this.executeQuery(
      query,
      [tenantId, featureKey],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
}

import { Injectable } from '@nestjs/common';
import {
  AddonEntitlement,
  CreateTenantAddonRow,
  FeatureKey,
  FeatureType,
  TenantAddon,
  TenantAddonWithEntitlements,
  UpdateTenantAddonRow,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';

type TenantAddonRow = {
  id: string;
  tenant_id: string;
  addon_id: string;
  quantity: number;
  status: string;
  starts_at: Date;
  expires_at: Date | null;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Tenant Add-on entities.
 * Tracks active add-on subscriptions for tenants.
 */
@Injectable()
export class TenantAddonsRepository extends BaseRepository<
  TenantAddon,
  CreateTenantAddonRow,
  UpdateTenantAddonRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.tenant_addons');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, addon_id, quantity, status, starts_at, expires_at, metadata, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): TenantAddon {
    const data = row as TenantAddonRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      addon_id: data.addon_id,
      quantity: data.quantity,
      status: data.status,
      starts_at: data.starts_at,
      expires_at: data.expires_at ?? undefined,
      metadata: (data.metadata as Record<string, any>) ?? {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Find all active add-ons for a tenant
   */
  async findActiveByTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantAddon[]> {
    const result = await this.executeQuery<TenantAddonRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE tenant_id = $1 AND status = 'active'
       AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC`,
      [tenantId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find active add-ons with entitlements (JOIN to avoid N+1)
   */
  async findActiveByTenantWithEntitlements(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantAddonWithEntitlements[]> {
    const query = `
      SELECT
        ta.id, ta.tenant_id, ta.addon_id, ta.quantity, ta.status, ta.starts_at,
        ta.expires_at, ta.metadata, ta.created_at, ta.updated_at,
        a.key as addon_key, a.name as addon_name,
        ae.id as entitlement_id, ae.feature_id, ae.value_bool, ae.value_int,
        ae.value_text, ae.metadata as entitlement_metadata, ae.created_at as entitlement_created_at,
        f.key as feature_key, f.feature_type
      FROM ${this.tableName} ta
      LEFT JOIN public.addons a ON a.id = ta.addon_id
      LEFT JOIN public.addon_entitlements ae ON ae.addon_id = ta.addon_id
      LEFT JOIN public.features f ON f.id = ae.feature_id
      WHERE ta.tenant_id = $1 AND ta.status = 'active'
        AND (ta.expires_at IS NULL OR ta.expires_at > now())
      ORDER BY ta.created_at DESC
    `;

    const result = await this.executeQuery(query, [tenantId], options);

    const addonsMap = new Map<
      string,
      TenantAddonWithEntitlements & { addon_name?: string }
    >();

    result.rows.forEach((row) => {
      const addonId = row.id as string;

      if (!addonsMap.has(addonId)) {
        const addon = this.mapRow(row);
        addonsMap.set(addonId, {
          ...addon,
          addon_key: row.addon_key as string,
          addon_name: row.addon_name as string,
          entitlements: [],
        });
      }

      if (row.entitlement_id) {
        const entitlement: AddonEntitlement = {
          id: row.entitlement_id as string,
          addon_id: row.addon_id as string,
          feature_id: row.feature_id as string,
          feature_key: row.feature_key as FeatureKey,
          feature_type: row.feature_type as FeatureType,
          value_bool: row.value_bool as boolean | undefined,
          value_int: row.value_int as number | undefined,
          value_text: row.value_text as string | undefined,
          metadata: (row.entitlement_metadata as Record<string, any>) ?? {},
          created_at: row.entitlement_created_at as Date,
        };
        addonsMap.get(addonId)!.entitlements.push(entitlement);
      }
    });

    return Array.from(addonsMap.values());
  }

  /**
   * Find active add-ons for a specific feature (JOIN to avoid N+1)
   */
  async findActiveByTenantAndFeature(
    tenantId: string,
    featureKey: FeatureKey,
    options?: QueryOptions,
  ): Promise<TenantAddonWithEntitlements[]> {
    const query = `
      SELECT
        ta.id, ta.tenant_id, ta.addon_id, ta.quantity, ta.status, ta.starts_at,
        ta.expires_at, ta.metadata, ta.created_at, ta.updated_at,
        ae.id as entitlement_id, ae.feature_id, ae.value_bool, ae.value_int,
        ae.value_text, ae.metadata as entitlement_metadata, ae.created_at as entitlement_created_at,
        f.key as feature_key, f.feature_type
      FROM ${this.tableName} ta
      JOIN public.addon_entitlements ae ON ae.addon_id = ta.addon_id
      JOIN public.features f ON f.id = ae.feature_id
      WHERE ta.tenant_id = $1 AND ta.status = 'active'
        AND (ta.expires_at IS NULL OR ta.expires_at > now())
        AND f.key = $2
      ORDER BY ta.created_at DESC
    `;

    const result = await this.executeQuery(
      query,
      [tenantId, featureKey],
      options,
    );

    // Group by tenant_addon id
    const addonsMap = new Map<string, TenantAddonWithEntitlements>();

    result.rows.forEach((row) => {
      const addonId = row.id as string;

      if (!addonsMap.has(addonId)) {
        const addon = this.mapRow(row);
        addonsMap.set(addonId, {
          ...addon,
          entitlements: [],
        });
      }

      const entitlement: AddonEntitlement = {
        id: row.entitlement_id as string,
        addon_id: row.addon_id as string,
        feature_id: row.feature_id as string,
        feature_key: row.feature_key as FeatureKey,
        feature_type: row.feature_type as FeatureType,
        value_bool: row.value_bool as boolean | undefined,
        value_int: row.value_int as number | undefined,
        value_text: row.value_text as string | undefined,
        metadata: (row.entitlement_metadata as Record<string, any>) ?? {},
        created_at: row.entitlement_created_at as Date,
      };
      addonsMap.get(addonId)!.entitlements.push(entitlement);
    });

    return Array.from(addonsMap.values());
  }
}

import { Injectable } from '@nestjs/common';
import {
  Addon,
  AddonEntitlement,
  FeatureKey,
  FeatureType,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';

// Row types for BaseRepository (not used for reads but required by interface)
type CreateAddonRow = {
  id?: string;
  key: string;
  name: string;
  description?: string;
  price_monthly?: number;
  price_currency?: string;
  is_active?: boolean;
  metadata?: string;
};

type UpdateAddonRow = {
  name?: string;
  description?: string;
  price_monthly?: number;
  price_currency?: string;
  is_active?: boolean;
  metadata?: string;
};

type AddonRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_currency: string;
  is_active: boolean;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

/**
 * Add-on with entitlements (for catalog detail view)
 */
export interface AddonWithEntitlements extends Addon {
  entitlements: AddonEntitlement[];
}

/**
 * Repository for managing Add-on catalog entities.
 * Reads from the global addons and addon_entitlements tables.
 */
@Injectable()
export class AddonsRepository extends BaseRepository<
  Addon,
  CreateAddonRow,
  UpdateAddonRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.addons');
  }

  protected getSelectColumns(): string {
    return 'id, key, name, description, price_monthly, price_currency, is_active, metadata, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): Addon {
    const data = row as AddonRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description ?? undefined,
      price_monthly: data.price_monthly,
      price_currency: data.price_currency,
      is_active: data.is_active,
      metadata: (data.metadata as Record<string, any>) ?? {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Find all active add-ons (for public catalog listing)
   */
  async findAllActive(options?: QueryOptions): Promise<Addon[]> {
    const result = await this.executeQuery<AddonRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE is_active = true
       ORDER BY name ASC`,
      [],
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find add-on by key
   */
  async findByKey(key: string, options?: QueryOptions): Promise<Addon | null> {
    const result = await this.executeQuery<AddonRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE key = $1`,
      [key],
      options,
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find add-on by key with entitlements (JOIN to avoid N+1)
   */
  async findByKeyWithEntitlements(
    key: string,
    options?: QueryOptions,
  ): Promise<AddonWithEntitlements | null> {
    const query = `
      SELECT
        a.id, a.key, a.name, a.description, a.price_monthly, a.price_currency,
        a.is_active, a.metadata, a.created_at, a.updated_at,
        ae.id as entitlement_id, ae.feature_id, ae.value_bool, ae.value_int,
        ae.value_text, ae.metadata as entitlement_metadata, ae.created_at as entitlement_created_at,
        f.key as feature_key, f.feature_type
      FROM ${this.tableName} a
      LEFT JOIN public.addon_entitlements ae ON ae.addon_id = a.id
      LEFT JOIN public.features f ON f.id = ae.feature_id
      WHERE a.key = $1
    `;

    const result = await this.executeQuery(query, [key], options);

    if (result.rows.length === 0) {
      return null;
    }

    // Map the first row to get addon base data
    const addon = this.mapRow(result.rows[0]);
    const entitlements: AddonEntitlement[] = [];

    // Collect all entitlements
    result.rows.forEach((row) => {
      if (row.entitlement_id) {
        entitlements.push({
          id: row.entitlement_id as string,
          addon_id: row.id as string,
          feature_id: row.feature_id as string,
          feature_key: row.feature_key as FeatureKey,
          feature_type: row.feature_type as FeatureType,
          value_bool: row.value_bool as boolean | undefined,
          value_int: row.value_int as number | undefined,
          value_text: row.value_text as string | undefined,
          metadata: (row.entitlement_metadata as Record<string, any>) ?? {},
          created_at: row.entitlement_created_at as Date,
        });
      }
    });

    return {
      ...addon,
      entitlements,
    };
  }
}

import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreatePlanRow,
  Plan,
  PlanEntitlement,
  PlanKey,
  PlanWithEntitlements,
  UpdatePlanRow,
} from 'src/common/types/entitlement.types';

type PlanRow = {
  id: string;
  key: PlanKey;
  name: string;
  description: string | null;
  price_monthly: number;
  price_currency: string;
  billing_period: string;
  is_active: boolean;
  sort_order: number;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Plan catalog entities.
 * Plans define subscription tiers (navigator, shield, general_counsel, infrastructure).
 */
@Injectable()
export class PlansRepository extends BaseRepository<
  Plan,
  CreatePlanRow,
  UpdatePlanRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.plans');
  }

  protected getSelectColumns(): string {
    return 'id, key, name, description, price_monthly, price_currency, billing_period, is_active, sort_order, metadata, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): Plan {
    const data = row as PlanRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description ?? undefined,
      price_monthly: data.price_monthly,
      price_currency: data.price_currency,
      billing_period: data.billing_period,
      is_active: data.is_active,
      sort_order: data.sort_order,
      metadata: (data.metadata as Record<string, any>) ?? {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Find plan by key
   */
  async findByKey(key: PlanKey, options?: QueryOptions): Promise<Plan | null> {
    const result = await this.executeQuery<PlanRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE key = $1`,
      [key],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find all active plans ordered by sort_order
   */
  async findAll(options?: QueryOptions): Promise<Plan[]> {
    const result = await this.executeQuery<PlanRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE is_active = true ORDER BY sort_order`,
      [],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find plan by key with entitlements (JOIN to avoid N+1)
   */
  async findByKeyWithEntitlements(
    key: PlanKey,
    options?: QueryOptions,
  ): Promise<PlanWithEntitlements | null> {
    const query = `
      SELECT
        p.id, p.key, p.name, p.description, p.price_monthly, p.price_currency,
        p.billing_period, p.is_active, p.sort_order, p.metadata, p.created_at, p.updated_at,
        pe.id as entitlement_id, pe.feature_id, pe.value_bool, pe.value_int, pe.value_text,
        pe.metadata as entitlement_metadata, pe.created_at as entitlement_created_at,
        f.key as feature_key
      FROM ${this.tableName} p
      LEFT JOIN public.plan_entitlements pe ON pe.plan_id = p.id
      LEFT JOIN public.features f ON f.id = pe.feature_id
      WHERE p.key = $1
    `;

    const result = await this.executeQuery(query, [key], options);

    if (result.rows.length === 0) {
      return null;
    }

    // Map first row to plan
    const firstRow = result.rows[0];
    const plan = this.mapRow(firstRow);

    // Map all rows to entitlements
    const entitlements: PlanEntitlement[] = result.rows
      .filter((row) => row.entitlement_id)
      .map((row) => ({
        id: row.entitlement_id as string,
        plan_id: row.id as string,
        feature_id: row.feature_id as string,
        value_bool: row.value_bool as boolean | undefined,
        value_int: row.value_int as number | undefined,
        value_text: row.value_text as string | undefined,
        metadata: (row.entitlement_metadata as Record<string, any>) ?? {},
        created_at: row.entitlement_created_at as Date,
      }));

    return {
      ...plan,
      entitlements,
    };
  }

  /**
   * Upsert plan by key (for sync service)
   */
  async upsertByKey(
    plan: CreatePlanRow,
    options?: QueryOptions,
  ): Promise<Plan> {
    const result = await this.executeQuery<PlanRow>(
      `
      INSERT INTO ${this.tableName} (key, name, description, price_monthly, price_currency, billing_period, is_active, sort_order, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        price_currency = EXCLUDED.price_currency,
        billing_period = EXCLUDED.billing_period,
        is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING ${this.getSelectColumns()}
      `,
      [
        plan.key,
        plan.name,
        plan.description ?? null,
        plan.price_monthly ?? 0,
        plan.price_currency ?? 'AED',
        plan.billing_period ?? 'monthly',
        plan.is_active ?? true,
        plan.sort_order ?? 0,
        plan.metadata ?? '{}',
      ],
      options,
    );

    return this.mapRow(result.rows[0]);
  }
}

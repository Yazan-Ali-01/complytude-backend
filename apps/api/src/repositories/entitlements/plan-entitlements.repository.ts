import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  CreatePlanEntitlementRow,
  PlanEntitlement,
  UpdatePlanEntitlementRow,
} from 'src/common/types/entitlement.types';

type PlanEntitlementRow = {
  id: string;
  plan_id: string;
  feature_id: string;
  value_bool: boolean | null;
  value_int: number | null;
  value_text: string | null;
  created_at: Date;
};

/**
 * Repository for managing Plan Entitlement entities.
 * Defines what features each plan grants.
 */
@Injectable()
export class PlanEntitlementsRepository extends BaseRepository<
  PlanEntitlement,
  CreatePlanEntitlementRow,
  UpdatePlanEntitlementRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.plan_entitlements');
  }

  protected getSelectColumns(): string {
    return 'id, plan_id, feature_id, value_bool, value_int, value_text, created_at';
  }

  protected mapRow(row: Record<string, unknown>): PlanEntitlement {
    const data = row as PlanEntitlementRow;
    return {
      id: data.id,
      plan_id: data.plan_id,
      feature_id: data.feature_id,
      value_bool: data.value_bool ?? undefined,
      value_int: data.value_int ?? undefined,
      value_text: data.value_text ?? undefined,
      created_at: data.created_at,
    };
  }

  /**
   * Find all entitlements for a plan
   */
  async findByPlanId(
    planId: string,
    options?: QueryOptions,
  ): Promise<PlanEntitlement[]> {
    const result = await this.executeQuery<PlanEntitlementRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE plan_id = $1`,
      [planId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find specific entitlement for a plan and feature
   */
  async findByPlanAndFeature(
    planId: string,
    featureId: string,
    options?: QueryOptions,
  ): Promise<PlanEntitlement | null> {
    const result = await this.executeQuery<PlanEntitlementRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE plan_id = $1 AND feature_id = $2`,
      [planId, featureId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Bulk upsert entitlements for a plan (for sync service)
   * Returns array of synced entitlement IDs
   */
  async syncForPlan(
    planId: string,
    entitlements: Array<{
      plan_id: string;
      feature_id: string;
      value_bool: boolean | null;
      value_int: number | null;
      value_text: string | null;
    }>,
    options?: QueryOptions,
  ): Promise<string[]> {
    if (entitlements.length === 0) return [];

    // Build bulk upsert query
    const values: unknown[] = [];
    const valuesClauses: string[] = [];

    entitlements.forEach((ent, idx) => {
      const offset = idx * 5;
      valuesClauses.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
      );
      values.push(
        ent.plan_id,
        ent.feature_id,
        ent.value_bool,
        ent.value_int,
        ent.value_text,
      );
    });

    const result = await this.executeQuery<{ id: string }>(
      `
      INSERT INTO ${this.tableName} (plan_id, feature_id, value_bool, value_int, value_text)
      VALUES ${valuesClauses.join(', ')}
      ON CONFLICT (plan_id, feature_id) DO UPDATE SET
        value_bool = EXCLUDED.value_bool,
        value_int = EXCLUDED.value_int,
        value_text = EXCLUDED.value_text
      RETURNING id
      `,
      values,
      options,
    );

    return result.rows.map((row) => row.id);
  }
}

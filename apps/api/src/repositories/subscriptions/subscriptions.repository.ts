import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateTenantSubscriptionRow,
  Plan,
  SubscriptionStatus,
  TenantSubscription,
  UpdateTenantSubscriptionRow,
} from 'src/common/types/entitlement.types';

type TenantSubscriptionRow = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_period_start: Date;
  billing_period_end: Date;
  current_period_start: Date;
  current_period_end: Date;
  cancelled_at: Date | null;
  trial_ends_at: Date | null;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

export interface TenantSubscriptionWithPlan extends TenantSubscription {
  plan?: Plan;
}

/**
 * Repository for managing Tenant Subscription entities.
 * Tracks active plan bindings and billing periods.
 */
@Injectable()
export class SubscriptionsRepository extends BaseRepository<
  TenantSubscription,
  CreateTenantSubscriptionRow,
  UpdateTenantSubscriptionRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.tenant_subscriptions');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, plan_id, status, billing_period_start, billing_period_end, current_period_start, current_period_end, cancelled_at, trial_ends_at, metadata, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): TenantSubscription {
    const data = row as TenantSubscriptionRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      plan_id: data.plan_id,
      status: data.status,
      billing_period_start: data.billing_period_start,
      billing_period_end: data.billing_period_end,
      current_period_start: data.current_period_start,
      current_period_end: data.current_period_end,
      cancelled_at: data.cancelled_at ?? undefined,
      trial_ends_at: data.trial_ends_at
        ? new Date(data.trial_ends_at)
        : undefined,
      metadata: (data.metadata as Record<string, unknown>) ?? {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Find active subscription for a tenant
   * Includes both 'active' and 'trialing' statuses (trial tenants are treated as active for entitlements)
   */
  async findActiveByTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription | null> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE tenant_id = $1 AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find active subscription with plan details (JOIN to avoid N+1)
   * Includes both 'active' and 'trialing' statuses
   */
  async findActiveByTenantWithPlan(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscriptionWithPlan | null> {
    const query = `
      SELECT
        ts.id, ts.tenant_id, ts.plan_id, ts.status, ts.billing_period_start,
        ts.billing_period_end, ts.current_period_start, ts.current_period_end,
        ts.cancelled_at, ts.trial_ends_at, ts.metadata, ts.created_at, ts.updated_at,
        p.key as plan_key, p.name as plan_name,
        p.description as plan_description, p.price_monthly, p.price_currency,
        p.billing_period as plan_billing_period, p.is_active as plan_is_active,
        p.sort_order, p.metadata as plan_metadata, p.created_at as plan_created_at,
        p.updated_at as plan_updated_at
      FROM ${this.tableName} ts
      JOIN public.plans p ON p.id = ts.plan_id
      WHERE ts.tenant_id = $1 AND ts.status IN ('active', 'trialing')
      ORDER BY ts.created_at DESC
      LIMIT 1
    `;

    const result = await this.executeQuery(query, [tenantId], options);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const subscription = this.mapRow(row);

    const plan: Plan = {
      id: subscription.plan_id,
      key: row.plan_key as Plan['key'],
      name: row.plan_name as string,
      description: (row.plan_description as string) ?? undefined,
      price_monthly: row.price_monthly as number,
      price_currency: row.price_currency as string,
      billing_period: row.plan_billing_period as string,
      is_active: row.plan_is_active as boolean,
      sort_order: row.sort_order as number,
      metadata: (row.plan_metadata as Record<string, unknown>) ?? {},
      created_at: row.plan_created_at as Date,
      updated_at: row.plan_updated_at as Date,
    };

    return {
      ...subscription,
      plan,
    };
  }

  /**
   * Upsert subscription (for sync/migration)
   */
  async upsert(
    subscription: CreateTenantSubscriptionRow,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `
      INSERT INTO ${this.tableName} (tenant_id, plan_id, status, billing_period_start, billing_period_end, current_period_start, current_period_end, trial_ends_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id) WHERE (status IN ('active', 'trialing'))
      DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        billing_period_end = EXCLUDED.billing_period_end,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        trial_ends_at = EXCLUDED.trial_ends_at,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING ${this.getSelectColumns()}
      `,
      [
        subscription.tenant_id,
        subscription.plan_id,
        subscription.status ?? 'active',
        subscription.billing_period_start,
        subscription.billing_period_end,
        subscription.current_period_start,
        subscription.current_period_end,
        subscription.trial_ends_at ?? null,
        subscription.metadata ?? '{}',
      ],
      options,
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find all subscriptions due for renewal (Phase 6)
   * Returns subscriptions where current_period_end <= now() and status = 'active'
   */
  async findAllDueForRenewal(
    options?: QueryOptions,
  ): Promise<TenantSubscription[]> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE status = 'active' AND current_period_end <= now()
       ORDER BY current_period_end ASC`,
      [],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Update plan for a subscription (Phase 6)
   */
  async updatePlan(
    id: string,
    planId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `UPDATE ${this.tableName}
       SET plan_id = $1, updated_at = now()
       WHERE id = $2
       RETURNING ${this.getSelectColumns()}`,
      [planId, id],
      options,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Subscription not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update subscription status (Phase 6)
   */
  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    cancelledAt?: Date,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `UPDATE ${this.tableName}
       SET status = $1, cancelled_at = $2, trial_ends_at = NULL, updated_at = now()
       WHERE id = $3
       RETURNING ${this.getSelectColumns()}`,
      [status, cancelledAt ?? null, id],
      options,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Subscription not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update billing period (Phase 6)
   */
  async updatePeriod(
    id: string,
    periodStart: Date,
    periodEnd: Date,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `UPDATE ${this.tableName}
       SET current_period_start = $1, current_period_end = $2, updated_at = now()
       WHERE id = $3
       RETURNING ${this.getSelectColumns()}`,
      [periodStart, periodEnd, id],
      options,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Subscription not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find expired trial subscriptions for batch processing
   * Used by the trial expiry job
   */
  async findExpiredTrials(
    limit = 100,
    options?: QueryOptions,
  ): Promise<TenantSubscription[]> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE status = 'trialing' AND trial_ends_at <= NOW()
       ORDER BY trial_ends_at ASC
       LIMIT $1`,
      [limit],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Update subscription for trial expiry: set status to active, change plan, set new period, clear trial_ends_at
   */
  async updateForTrialExpiry(
    id: string,
    planId: string,
    periodStart: Date,
    periodEnd: Date,
    options?: QueryOptions,
  ): Promise<TenantSubscription | null> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `UPDATE ${this.tableName}
       SET status = 'active', plan_id = $1,
           billing_period_start = $2, billing_period_end = $3,
           current_period_start = $2, current_period_end = $3,
           trial_ends_at = NULL, updated_at = now()
       WHERE id = $4 AND status = 'trialing'
       RETURNING ${this.getSelectColumns()}`,
      [planId, periodStart, periodEnd, id],
      options,
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }
}

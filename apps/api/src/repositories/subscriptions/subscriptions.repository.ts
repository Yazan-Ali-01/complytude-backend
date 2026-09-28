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
  trial_reminder_sent_at: Date | null;
  metadata: unknown;
  billing_interval: string | null;
  cancel_at_period_end: boolean;
  downgraded_from_stripe: boolean;
  stripe_subscription_id: string | null;
  stripe_schedule_id: string | null;
  stripe_current_period_end: Date | null;
  stripe_status: string | null;
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
    return 'id, tenant_id, plan_id, status, billing_period_start, billing_period_end, current_period_start, current_period_end, cancelled_at, trial_ends_at, trial_reminder_sent_at, metadata, billing_interval, cancel_at_period_end, downgraded_from_stripe, stripe_subscription_id, stripe_schedule_id, stripe_current_period_end, stripe_status, created_at, updated_at';
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
      trial_reminder_sent_at: data.trial_reminder_sent_at
        ? new Date(data.trial_reminder_sent_at)
        : null,
      metadata: (data.metadata as Record<string, unknown>) ?? {},
      billing_interval: data.billing_interval as
        | 'monthly'
        | 'annual'
        | null
        | undefined,
      cancel_at_period_end: data.cancel_at_period_end ?? false,
      downgraded_from_stripe: data.downgraded_from_stripe ?? false,
      stripe_subscription_id: data.stripe_subscription_id,
      stripe_schedule_id: data.stripe_schedule_id,
      stripe_current_period_end: data.stripe_current_period_end,
      stripe_status: data.stripe_status,
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
   * Find current (non-cancelled) subscription for a tenant.
   * Returns active, past_due, or trialing subscriptions — any subscription
   * that should still grant access (possibly degraded for past_due).
   */
  async findCurrentByTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription | null> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE tenant_id = $1 AND status IN ('active', 'past_due', 'trialing')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find active subscription with plan details (JOIN to avoid N+1)
   * Includes both 'active' and 'trialing' statuses (trial tenants treated as active for entitlements)
   */
  async findActiveByTenantWithPlan(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscriptionWithPlan | null> {
    return this.findByTenantWithPlan(
      tenantId,
      `ts.status IN ('active', 'trialing')`,
      options,
    );
  }

  /**
   * Find current (non-cancelled) subscription with plan details.
   * Returns active, past_due, or trialing subscriptions — any subscription
   * that should still grant access.
   */
  async findCurrentByTenantWithPlan(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscriptionWithPlan | null> {
    return this.findByTenantWithPlan(
      tenantId,
      `ts.status IN ('active', 'past_due', 'trialing')`,
      options,
    );
  }

  private async findByTenantWithPlan(
    tenantId: string,
    statusFilter: string,
    options?: QueryOptions,
  ): Promise<TenantSubscriptionWithPlan | null> {
    const query = `
      SELECT
        ts.id, ts.tenant_id, ts.plan_id, ts.status, ts.billing_period_start,
        ts.billing_period_end, ts.current_period_start, ts.current_period_end,
        ts.cancelled_at, ts.trial_ends_at, ts.trial_reminder_sent_at, ts.metadata,
        ts.billing_interval, ts.cancel_at_period_end, ts.downgraded_from_stripe,
        ts.stripe_subscription_id, ts.stripe_schedule_id, ts.stripe_current_period_end,
        ts.stripe_status, ts.created_at, ts.updated_at,
        p.key as plan_key, p.name as plan_name,
        p.description as plan_description, p.price_monthly, p.price_currency,
        p.billing_period as plan_billing_period, p.is_active as plan_is_active,
        p.sort_order, p.created_at as plan_created_at,
        p.updated_at as plan_updated_at
      FROM ${this.tableName} ts
      JOIN public.plans p ON p.id = ts.plan_id
      WHERE ts.tenant_id = $1 AND ${statusFilter}
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
      INSERT INTO ${this.tableName} (
        tenant_id, plan_id, status,
        billing_period_start, billing_period_end,
        current_period_start, current_period_end,
        trial_ends_at, metadata,
        billing_interval, cancel_at_period_end, downgraded_from_stripe,
        stripe_subscription_id, stripe_schedule_id,
        stripe_current_period_end, stripe_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (tenant_id) WHERE (status IN ('active', 'trialing'))
      DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        billing_period_end = EXCLUDED.billing_period_end,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        trial_ends_at = EXCLUDED.trial_ends_at,
        metadata = EXCLUDED.metadata,
        billing_interval = COALESCE(EXCLUDED.billing_interval, ${this.tableName}.billing_interval),
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        downgraded_from_stripe = EXCLUDED.downgraded_from_stripe,
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, ${this.tableName}.stripe_subscription_id),
        stripe_schedule_id = COALESCE(EXCLUDED.stripe_schedule_id, ${this.tableName}.stripe_schedule_id),
        stripe_current_period_end = COALESCE(EXCLUDED.stripe_current_period_end, ${this.tableName}.stripe_current_period_end),
        stripe_status = COALESCE(EXCLUDED.stripe_status, ${this.tableName}.stripe_status),
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
        subscription.billing_interval ?? null,
        subscription.cancel_at_period_end ?? false,
        subscription.downgraded_from_stripe ?? false,
        subscription.stripe_subscription_id ?? null,
        subscription.stripe_schedule_id ?? null,
        subscription.stripe_current_period_end ?? null,
        subscription.stripe_status ?? null,
      ],
      options,
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find subscription by Stripe subscription ID
   */
  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription | null> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE stripe_subscription_id = $1 LIMIT 1`,
      [stripeSubscriptionId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find all subscriptions with a Stripe subscription ID (active, past_due, trialing).
   * Used by the reconciliation service to compare our state against Stripe.
   *
   * @param tenantId - Optional. If provided, only return subscriptions for this tenant.
   */
  async findAllWithStripeId(
    tenantId?: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription[]> {
    const params: unknown[] = [];
    const conditions = [
      'stripe_subscription_id IS NOT NULL',
      "status IN ('active', 'past_due', 'trialing')",
    ];
    if (tenantId) {
      params.push(tenantId);
      conditions.push(`tenant_id = $${params.length}`);
    }
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at ASC`,
      params,
      options,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all Navigator (free) subscriptions due for period renewal.
   * Scoped to subscriptions with no Stripe subscription ID — Stripe-backed
   * subscriptions are renewed via the invoice.paid webhook instead.
   */
  async findAllDueForRenewal(
    options?: QueryOptions,
  ): Promise<TenantSubscription[]> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE status = 'active'
         AND current_period_end <= now()
         AND stripe_subscription_id IS NULL
       ORDER BY current_period_end ASC`,
      [],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
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
   * Find expired local trials for batch processing (the trial expiry job).
   * Stripe-backed subscriptions are excluded: Stripe owns their trial and status.
   */
  async findExpiredTrials(
    limit = 100,
    options?: QueryOptions,
  ): Promise<TenantSubscription[]> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE status = 'trialing' AND trial_ends_at <= NOW()
         AND stripe_subscription_id IS NULL
       ORDER BY trial_ends_at ASC
       LIMIT $1`,
      [limit],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find trials about to expire that haven't been reminded yet.
   *
   * Returns trials whose `trial_ends_at` falls in the configurable window
   * (default 2–4 days ahead). The window is wider than 1 day on purpose so a
   * missed cron tick still picks up the row on the next run; the
   * `trial_reminder_sent_at` flag prevents duplicate sends. Pairs with the
   * partial index `idx_tenant_subscriptions_trial_reminder_due`.
   *
   * @param windowStartDays - Earliest "days from now" the trial may end (inclusive)
   * @param windowEndDays   - Latest "days from now" the trial may end (exclusive)
   * @param limit           - Batch size for the cron handler
   */
  async findTrialsEndingSoon(
    windowStartDays: number,
    windowEndDays: number,
    limit = 100,
    options?: QueryOptions,
  ): Promise<TenantSubscription[]> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE status = 'trialing'
         AND trial_reminder_sent_at IS NULL
         AND trial_ends_at >= now() + ($1 || ' days')::interval
         AND trial_ends_at <  now() + ($2 || ' days')::interval
       ORDER BY trial_ends_at ASC
       LIMIT $3`,
      [windowStartDays, windowEndDays, limit],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Mark the "trial ending soon" reminder as sent for a subscription.
   * Idempotent: subsequent calls only update the timestamp.
   */
  async markTrialReminderSent(
    id: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription | null> {
    const result = await this.executeQuery<TenantSubscriptionRow>(
      `UPDATE ${this.tableName}
       SET trial_reminder_sent_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING ${this.getSelectColumns()}`,
      [id],
      options,
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update subscription for trial expiry: set status to active, change plan, set new period, clear trial_ends_at.
   * Never touches a Stripe-backed subscription.
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
       WHERE id = $4 AND status = 'trialing' AND stripe_subscription_id IS NULL
       RETURNING ${this.getSelectColumns()}`,
      [planId, periodStart, periodEnd, id],
      options,
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }
}

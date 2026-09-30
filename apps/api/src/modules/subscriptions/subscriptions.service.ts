import { DatabaseService, QueryOptions } from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import {
  PlanKey,
  TenantSubscription,
} from 'src/common/types/entitlement.types';
import { TRIAL_CONFIG } from 'src/common/constants/trial-config.constant';
import { EntitlementSnapshotsRepository } from 'src/repositories/entitlements/entitlement-snapshots.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import {
  SubscriptionsRepository,
  TenantSubscriptionWithPlan,
} from 'src/repositories/subscriptions/subscriptions.repository';
import { DomainEventsService } from '../entitlements/services/domain-events.service';
import { SubscriptionsI18n } from './constants/i18n.constants';

/**
 * Subscriptions Service
 *
 * Internal service for reading subscription state and managing Navigator (free) subscription lifecycle.
 * All paid subscription mutations go through StripeSubscriptionService or Stripe webhooks.
 *
 * Responsibilities:
 * - Read current subscription (populated by Stripe webhooks for paid plans)
 * - Renew billing period for Navigator (free) subscriptions
 * - Batch renewal cron for Navigator-only subscriptions
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly plansRepository: PlansRepository,
    private readonly entitlementSnapshotsRepository: EntitlementSnapshotsRepository,
    private readonly domainEventsService: DomainEventsService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Get current subscription for a tenant with plan details.
   * Returns active, past_due, or trialing subscriptions.
   *
   * @throws NotFoundException if no non-cancelled subscription found
   */
  async getCurrentSubscription(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscriptionWithPlan> {
    const execute = async (client: PoolClient) => {
      const subscription =
        await this.subscriptionsRepository.findCurrentByTenantWithPlan(
          tenantId,
          { client },
        );
      if (!subscription) {
        throw new NotFoundException(
          this.i18n.t(SubscriptionsI18n.errors.SUBSCRIPTION_NOT_FOUND),
        );
      }
      return subscription;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Local plan, status and period changes are for subscriptions this service owns (trials, the
   * free plan). A Stripe-backed subscription changes only through Stripe (the /billing/*
   * endpoints) and its webhooks; changing it here would skip payment or keep charging the card.
   */
  private assertNotStripeManaged(subscription: TenantSubscription): void {
    if (subscription.stripe_subscription_id) {
      throw new ConflictException(
        this.i18n.t(SubscriptionsI18n.errors.SUBSCRIPTION_MANAGED_BY_STRIPE),
      );
    }
  }

  /**
   * Create new subscription for a tenant
   *
   * Flow:
   * 1. Check no active subscription exists
   * 2. Find plan by key
   * 3. Calculate billing period (start = now, end = +1 month)
   * 4. Create subscription row
   * 5. Emit domain event
   * 6. Return new subscription
   *
   * @param tenantId - Tenant ID
   * @param planKey - Plan key to subscribe to
   * @param actorId - User ID performing the creation (null for system-initiated)
   * @param options - Optional database client for transaction support
   * @returns New subscription
   * @throws BadRequestException if active subscription already exists
   * @throws NotFoundException if plan not found
   */
  async createSubscription(
    tenantId: string,
    planKey: PlanKey,
    actorId: string | null,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const execute = async (client: PoolClient) => {
      this.logger.log(
        `Creating subscription: tenant=${tenantId}, plan=${planKey}, actor=${actorId ?? 'system'}`,
      );

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subscription = await this._createSubscription(
        tenantId,
        planKey,
        actorId,
        { status: 'active', now, periodEnd, eventType: 'subscription.created' },
        client,
      );

      this.logger.log(
        `Subscription created: tenant=${tenantId}, plan=${planKey}`,
      );
      return subscription;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Create trial subscription for a new tenant
   *
   * Trial subscriptions:
   * - status: 'trialing'
   * - plan: general_counsel (full features to hook users)
   * - trial_ends_at: NOW() + 14 days
   * - current_period aligned with trial end
   *
   * @param tenantId - Tenant ID
   * @param actorId - User ID performing the creation (null for system-initiated)
   * @param options - Optional database client for transaction support
   * @returns New trial subscription
   */
  async createTrialSubscription(
    tenantId: string,
    actorId: string | null,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const execute = async (client: PoolClient) => {
      this.logger.log(
        `Creating trial subscription: tenant=${tenantId}, actor=${actorId ?? 'system'}`,
      );

      const now = new Date();
      const trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_CONFIG.DURATION_DAYS);

      const subscription = await this._createSubscription(
        tenantId,
        TRIAL_CONFIG.PLAN_KEY,
        actorId,
        {
          status: 'trialing',
          now,
          periodEnd: trialEndsAt,
          trialEndsAt,
          eventType: 'subscription.trial_started',
        },
        client,
      );

      this.logger.log(
        `Trial subscription created: tenant=${tenantId}, trialEndsAt=${trialEndsAt.toISOString()}`,
      );
      return subscription;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Shared implementation for createSubscription and createTrialSubscription.
   *
   * Handles: duplicate check, plan lookup/validation, row insert (with 23505 guard),
   * snapshot invalidation, and domain event emission.
   */
  private async _createSubscription(
    tenantId: string,
    planKey: PlanKey,
    actorId: string | null,
    config: {
      status: 'active' | 'trialing';
      now: Date;
      periodEnd: Date;
      trialEndsAt?: Date;
      eventType: 'subscription.created' | 'subscription.trial_started';
    },
    client: PoolClient,
  ): Promise<TenantSubscription> {
    const existingSubscription =
      await this.subscriptionsRepository.findActiveByTenant(tenantId, {
        client,
      });

    if (existingSubscription) {
      throw new BadRequestException(
        this.i18n.t(SubscriptionsI18n.errors.SUBSCRIPTION_ALREADY_EXISTS),
      );
    }

    const plan = await this.plansRepository.findByKey(planKey, { client });
    if (!plan) {
      throw new NotFoundException(
        this.i18n.t(SubscriptionsI18n.errors.PLAN_NOT_FOUND),
      );
    }
    if (!plan.is_active) {
      throw new BadRequestException(
        this.i18n.t(SubscriptionsI18n.errors.PLAN_NOT_ACTIVE),
      );
    }

    // Plain INSERT — app-level check above guards against duplicates;
    // unique partial index provides DB-level race condition safety.
    let newSubscription: TenantSubscription;
    try {
      newSubscription = await this.subscriptionsRepository.create(
        {
          tenant_id: tenantId,
          plan_id: plan.id,
          status: config.status,
          billing_period_start: config.now,
          billing_period_end: config.periodEnd,
          current_period_start: config.now,
          current_period_end: config.periodEnd,
          ...(config.trialEndsAt !== undefined
            ? { trial_ends_at: config.trialEndsAt }
            : {}),
          metadata: '{}',
        },
        { client },
      );
    } catch (error) {
      if (error?.code === '23505') {
        throw new ConflictException(
          this.i18n.t(SubscriptionsI18n.errors.SUBSCRIPTION_ALREADY_EXISTS),
        );
      }
      throw error;
    }

    await this.entitlementSnapshotsRepository.invalidate(tenantId, { client });

    const eventPayload: Record<string, unknown> = {
      subscription_id: newSubscription.id,
      plan_id: plan.id,
      plan_key: plan.key,
    };
    if (config.trialEndsAt !== undefined) {
      eventPayload.trial_ends_at = config.trialEndsAt.toISOString();
    }

    await this.domainEventsService.emit(
      {
        tenant_id: tenantId,
        event_type: config.eventType,
        aggregate_type: 'subscription',
        aggregate_id: newSubscription.id,
        actor_id: actorId ?? undefined,
        actor_type: actorId ? 'user' : 'system',
        payload: JSON.stringify(eventPayload),
        metadata: JSON.stringify({ timestamp: new Date().toISOString() }),
      },
      { client },
    );

    return newSubscription;
  }

  /**
   * Renew billing period for a tenant
   *
   * Flow:
   * 1. Find active subscription
   * 2. Set current_period_start = old current_period_end
   * 3. Set current_period_end = +1 month from new start
   * 4. Update subscription
   * 5. Emit domain event
   * 6. Return updated subscription
   *
   * Note: This does NOT reset aggregated usage. Usage is tied to subscription_id,
   * so a new period within the same subscription continues accumulating usage.
   * To reset usage, you would need to create a new subscription or manually clear
   * the aggregated_usage table.
   *
   * @param tenantId - Tenant ID
   * @returns Updated subscription with new period
   *
   * @throws NotFoundException if no active subscription found
   */
  async renewPeriod(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const execute = async (client: PoolClient) => {
      this.logger.log(`Renewing billing period: tenant=${tenantId}`);

      const subscription =
        await this.subscriptionsRepository.findActiveByTenant(tenantId, {
          client,
        });

      if (!subscription) {
        throw new NotFoundException(
          this.i18n.t(SubscriptionsI18n.errors.SUBSCRIPTION_NOT_FOUND),
        );
      }

      this.assertNotStripeManaged(subscription);

      const newPeriodStart = subscription.current_period_end;
      const newPeriodEnd = new Date(newPeriodStart);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      const renewedSubscription =
        await this.subscriptionsRepository.updatePeriod(
          subscription.id,
          newPeriodStart,
          newPeriodEnd,
          { client },
        );

      await this.domainEventsService.emit(
        {
          tenant_id: tenantId,
          event_type: 'subscription.renewed',
          aggregate_type: 'subscription',
          aggregate_id: renewedSubscription.id,
          actor_id: undefined,
          actor_type: 'system',
          payload: JSON.stringify({
            subscription_id: renewedSubscription.id,
            old_period_start: subscription.current_period_start,
            old_period_end: subscription.current_period_end,
            new_period_start: newPeriodStart,
            new_period_end: newPeriodEnd,
          }),
          metadata: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        },
        { client },
      );

      this.logger.log(
        `Billing period renewed: tenant=${tenantId}, newStart=${newPeriodStart.toISOString()}, newEnd=${newPeriodEnd.toISOString()}`,
      );

      return renewedSubscription;
    };

    if (options?.client) {
      return execute(options.client);
    }

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      execute,
    );
  }

  /**
   * Batch renewal for all Navigator (free) subscriptions due for period renewal.
   * Stripe-backed subscriptions are excluded (stripe_subscription_id IS NULL filter).
   * Intended to be called by a scheduled cron job.
   *
   * @returns Count of renewed subscriptions
   */
  async renewAllDuePeriods(): Promise<number> {
    this.logger.log(
      'Starting batch renewal for Navigator subscriptions due for renewal',
    );

    const dueSubscriptions =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.subscriptionsRepository.findAllDueForRenewal({ client }),
      );

    this.logger.log(
      `Found ${dueSubscriptions.length} Navigator subscriptions due for renewal`,
    );

    let renewedCount = 0;

    for (const subscription of dueSubscriptions) {
      try {
        await this.renewPeriod(subscription.tenant_id);
        renewedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to renew subscription for tenant=${subscription.tenant_id}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Batch renewal complete: ${renewedCount} subscriptions renewed`,
    );

    return renewedCount;
  }
}

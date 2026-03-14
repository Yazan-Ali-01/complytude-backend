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
import type { PlanKey } from 'src/common/types/entitlement.types';
import { TenantSubscription } from 'src/common/types/entitlement.types';
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
          `No active subscription found for tenant: ${tenantId}`,
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
   * Renew billing period for a Navigator (free) tenant.
   * For Stripe-backed subscriptions, period renewal is driven by the
   * invoice.paid webhook in StripeEventHandlersService.
   *
   * Flow:
   * 1. Validate new plan exists and is active
   * 2. Find current subscription
   * 3. If no subscription, create new one
   * 4. If same plan, throw error
   * 5. Within transaction:
   *    - Update subscription plan_id
   *    - Invalidate entitlement snapshot
   *    - Emit domain event
   * 6. Return updated subscription
   *
   * @param tenantId - Tenant ID
   * @param newPlanKey - New plan key to switch to
   * @param actorId - User ID performing the change
   * @returns Updated subscription
   * @throws NotFoundException if plan not found
   * @throws BadRequestException if already on this plan
   */
  async changePlan(
    tenantId: string,
    newPlanKey: PlanKey,
    actorId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    this.logger.log(
      `Changing plan: tenant=${tenantId}, newPlan=${newPlanKey}, actor=${actorId}`,
    );

    const execute = async (client: PoolClient) => {
      // Step 1: Validate new plan
      const newPlan = await this.plansRepository.findByKey(newPlanKey, {
        client,
      });
      if (!newPlan) {
        throw new NotFoundException(
          this.i18n.t(SubscriptionsI18n.errors.PLAN_NOT_FOUND),
        );
      }

      if (!newPlan.is_active) {
        throw new BadRequestException(
          this.i18n.t(SubscriptionsI18n.errors.PLAN_NOT_ACTIVE),
        );
      }

      // Step 2: Find current subscription
      const currentSubscription =
        await this.subscriptionsRepository.findActiveByTenant(tenantId, {
          client,
        });

      // Step 3: If no subscription, create new one
      if (!currentSubscription) {
        this.logger.log(
          `No active subscription found, creating new one for tenant=${tenantId}`,
        );
        return this.createSubscription(tenantId, newPlanKey, actorId, {
          client,
        });
      }

      // Step 4: Check if already on this plan
      if (currentSubscription.plan_id === newPlan.id) {
        throw new BadRequestException(
          this.i18n.t(SubscriptionsI18n.errors.ALREADY_ON_PLAN),
        );
      }

      // Step 5: Get old plan for event
      const oldPlan = await this.plansRepository.findById(
        currentSubscription.plan_id,
        { client },
      );

      // Step 6: Update plan
      const updatedSubscription = await this.subscriptionsRepository.update(
        currentSubscription.id,
        { plan_id: newPlan.id },
        { client },
      );

      // Invalidate entitlement snapshot
      await this.entitlementSnapshotsRepository.invalidate(tenantId, {
        client,
      });

      // Emit domain event
      await this.domainEventsService.emit(
        {
          tenant_id: tenantId,
          event_type: 'subscription.plan_changed',
          aggregate_type: 'subscription',
          aggregate_id: updatedSubscription.id,
          actor_id: actorId,
          actor_type: 'user',
          payload: JSON.stringify({
            old_plan_id: oldPlan?.id,
            old_plan_key: oldPlan?.key,
            new_plan_id: newPlan.id,
            new_plan_key: newPlan.key,
          }),
          metadata: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        },
        { client },
      );

      this.logger.log(
        `Plan changed: tenant=${tenantId}, old=${oldPlan?.key}, new=${newPlan.key}`,
      );

      // TODO: BullMQ - Queue async job for plan change
      // When BullMQ is available:
      // await this.subscriptionQueue.add('plan-changed', {
      //   tenantId,
      //   subscriptionId: updatedSubscription.id,
      //   oldPlanKey: oldPlan?.key,
      //   newPlanKey: newPlan.key,
      //   actorId,
      // });
      // This job would:
      // 1. Calculate prorated billing adjustment
      // 2. Send email notification to tenant admin
      // 3. Update billing provider (Stripe/etc)

      return updatedSubscription;
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
   * Cancel subscription for a tenant
   *
   * Flow:
   * 1. Find active subscription
   * 2. Within transaction:
   *    - Update status to 'cancelled', set cancelled_at
   *    - Emit domain event
   * 3. Return updated subscription
   *
   * @param tenantId - Tenant ID
   * @param actorId - User ID performing the cancellation
   * @returns Cancelled subscription
   * @throws NotFoundException if no active subscription found
   */
  async cancel(
    tenantId: string,
    actorId: string,
    options?: QueryOptions,
  ): Promise<TenantSubscription> {
    const execute = async (client: PoolClient) => {
      this.logger.log(
        `Cancelling subscription: tenant=${tenantId}, actor=${actorId}`,
      );

      // Step 1: Find active subscription
      const subscription =
        await this.subscriptionsRepository.findActiveByTenant(tenantId, {
          client,
        });

      if (!subscription) {
        throw new NotFoundException(
          this.i18n.t(SubscriptionsI18n.errors.SUBSCRIPTION_NOT_FOUND),
        );
      }

      // Step 2: Update within transaction
      const cancelledSubscription =
        await this.subscriptionsRepository.updateStatus(
          subscription.id,
          'cancelled',
          new Date(),
          { client },
        );

      // Emit domain event
      await this.domainEventsService.emit(
        {
          tenant_id: tenantId,
          event_type: 'subscription.cancelled',
          aggregate_type: 'subscription',
          aggregate_id: cancelledSubscription.id,
          actor_id: actorId,
          actor_type: 'user',
          payload: JSON.stringify({
            subscription_id: cancelledSubscription.id,
            plan_id: cancelledSubscription.plan_id,
            cancelled_at: cancelledSubscription.cancelled_at,
          }),
          metadata: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        },
        { client },
      );

      this.logger.log(`Subscription cancelled: tenant=${tenantId}`);

      // TODO: BullMQ - Queue async job for cancellation
      // When BullMQ is available:
      // await this.subscriptionQueue.add('subscription-cancelled', {
      //   tenantId,
      //   subscriptionId: cancelledSubscription.id,
      //   actorId,
      // });
      // This job would:
      // 1. Send cancellation confirmation email
      // 2. Schedule downgrade at period end (if applicable)
      // 3. Update billing provider

      return cancelledSubscription;
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
   * Create new subscription for a tenant
   *
   * Flow:
   * 1. Check no active subscription exists
   * 2. Find plan by key
   * 3. Calculate billing period (start = now, end = +1 month)
   * 4. Create via upsert
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

      // Step 1: Check no active subscription exists
      const existingSubscription =
        await this.subscriptionsRepository.findActiveByTenant(tenantId, {
          client,
        });

      if (existingSubscription) {
        throw new BadRequestException(
          this.i18n.t(SubscriptionsI18n.errors.SUBSCRIPTION_ALREADY_EXISTS),
        );
      }

      // Step 2: Find plan
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

      // Step 3: Calculate billing period
      const now = new Date();
      const oneMonthLater = new Date(now);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

      // Step 4: Create subscription (plain INSERT — step 1 already guards against duplicates,
      // unique partial index provides DB-level race condition safety)
      let newSubscription: TenantSubscription;
      try {
        newSubscription = await this.subscriptionsRepository.create(
          {
            tenant_id: tenantId,
            plan_id: plan.id,
            status: 'active',
            billing_period_start: now,
            billing_period_end: oneMonthLater,
            current_period_start: now,
            current_period_end: oneMonthLater,
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

      // Invalidate any stale entitlement snapshot (relevant for re-subscription after cancellation)
      await this.entitlementSnapshotsRepository.invalidate(tenantId, {
        client,
      });

      // Emit domain event
      await this.domainEventsService.emit(
        {
          tenant_id: tenantId,
          event_type: 'subscription.created',
          aggregate_type: 'subscription',
          aggregate_id: newSubscription.id,
          actor_id: actorId ?? undefined,
          actor_type: actorId ? 'user' : 'system',
          payload: JSON.stringify({
            subscription_id: newSubscription.id,
            plan_id: plan.id,
            plan_key: plan.key,
          }),
          metadata: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        },
        { client },
      );

      this.logger.log(
        `Subscription created: tenant=${tenantId}, plan=${planKey}`,
      );

      return newSubscription;
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

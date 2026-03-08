import { QueryOptions } from '@lib/database';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  PlanKey,
  TenantSubscription,
} from 'src/common/types/entitlement.types';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import {
  SubscriptionsRepository,
  TenantSubscriptionWithPlan,
} from 'src/repositories/subscriptions/subscriptions.repository';
import { DatabaseService } from '../../database/database.service';
import { DomainEventsService } from '../entitlements/services/domain-events.service';

/**
 * Subscriptions Service
 *
 * Internal service for reading subscription state and managing Navigator (free) subscription lifecycle.
 * All paid subscription mutations go through StripeSubscriptionService or Stripe webhooks.
 *
 * Responsibilities:
 * - Read current subscription (populated by Stripe webhooks for paid plans)
 * - Create subscription row (internal — called by webhook handler on checkout.session.completed)
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
    private readonly domainEventsService: DomainEventsService,
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
   * Create new subscription for a tenant.
   * Internal — called by StripeEventHandlersService on checkout.session.completed,
   * and on tenant creation for the Navigator (free) plan.
   *
   * @throws BadRequestException if active subscription already exists
   * @throws NotFoundException if plan not found
   */
  async createSubscription(
    tenantId: string,
    planKey: PlanKey,
    actorId: string,
  ): Promise<TenantSubscription> {
    this.logger.log(
      `Creating subscription: tenant=${tenantId}, plan=${planKey}, actor=${actorId}`,
    );

    const existingSubscription =
      await this.subscriptionsRepository.findActiveByTenant(tenantId);

    if (existingSubscription) {
      throw new BadRequestException(
        `Tenant already has an active subscription. Use the plan change flow to switch plans.`,
      );
    }

    const plan = await this.plansRepository.findByKey(planKey);
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planKey}`);
    }

    if (!plan.is_active) {
      throw new BadRequestException(`Plan is not active: ${planKey}`);
    }

    const now = new Date();
    const oneMonthLater = new Date(now);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        const newSubscription = await this.subscriptionsRepository.upsert(
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

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.created',
            aggregate_type: 'subscription',
            aggregate_id: newSubscription.id,
            actor_id: actorId,
            actor_type: 'user',
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
      },
    );
  }

  /**
   * Renew billing period for a Navigator (free) tenant.
   * For Stripe-backed subscriptions, period renewal is driven by the
   * invoice.paid webhook in StripeEventHandlersService.
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
          `No active subscription found for tenant: ${tenantId}`,
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

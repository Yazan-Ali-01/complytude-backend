import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import {
  PlanKey,
  TenantSubscription,
} from 'src/common/types/entitlement.types';
import { mapStripeStatusToInternal } from '../stripe.utils';
import { DatabaseService } from '@lib/database';
import { EntitlementSnapshotsRepository } from 'src/repositories/entitlements/entitlement-snapshots.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { DomainEventsService } from 'src/modules/entitlements/services/domain-events.service';
import { StripeService } from '../stripe.service';

export interface ScheduledPlanChange {
  scheduledFor: Date;
  newPlanKey: PlanKey;
  currentPlanKey: PlanKey;
  stripeScheduleId: string;
}

export interface PendingPlanChange {
  hasPendingChange: false;
}

export interface ActivePendingPlanChange {
  hasPendingChange: true;
  scheduledFor: Date;
  newPlanKey: PlanKey;
  stripeScheduleId: string;
}

export type PendingPlanChangeResult =
  | PendingPlanChange
  | ActivePendingPlanChange;

@Injectable()
export class StripeSubscriptionService {
  private readonly logger = new Logger(StripeSubscriptionService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly stripeService: StripeService,
    private readonly plansRepository: PlansRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly entitlementSnapshotsRepository: EntitlementSnapshotsRepository,
    private readonly domainEventsService: DomainEventsService,
  ) {}

  /**
   * Schedule a plan change to take effect at the end of the current billing period.
   * Uses Stripe Subscription Schedules to ensure the transition happens cleanly.
   */
  async schedulePlanChange(
    tenantId: string,
    newPlanKey: PlanKey,
    actorId: string,
  ): Promise<ScheduledPlanChange> {
    const subscription = await this.findActiveSubscription(tenantId);

    if (!subscription?.stripe_subscription_id) {
      throw new BadRequestException(
        'No active Stripe subscription. Use the checkout flow to subscribe.',
      );
    }

    const [newPlan, stripeSubscription] = await Promise.all([
      this.plansRepository.findByKey(newPlanKey),
      this.stripeService.client.subscriptions.retrieve(
        subscription.stripe_subscription_id,
        { expand: ['items.data.price'] },
      ),
    ]);

    if (!newPlan) {
      throw new NotFoundException(`Plan not found: ${newPlanKey}`);
    }

    if (!newPlan.is_active) {
      throw new BadRequestException(`Plan is not active: ${newPlanKey}`);
    }

    // Resolve current plan to check for same-plan changes
    const currentItem = stripeSubscription.items.data[0];
    if (!currentItem) {
      throw new BadRequestException('Stripe subscription has no items');
    }

    const currentPriceId =
      typeof currentItem.price === 'string'
        ? currentItem.price
        : currentItem.price.id;

    if (
      currentPriceId === newPlan.stripe_price_id_monthly ||
      currentPriceId === newPlan.stripe_price_id_annual
    ) {
      throw new BadRequestException(
        `Already subscribed to plan: ${newPlanKey}`,
      );
    }

    // Determine the billing interval from the current subscription item price
    const currentPrice =
      typeof currentItem.price === 'string'
        ? await this.stripeService.client.prices.retrieve(currentItem.price)
        : currentItem.price;

    const currentInterval = currentPrice.recurring?.interval;
    const newPriceId =
      currentInterval === 'year'
        ? newPlan.stripe_price_id_annual
        : newPlan.stripe_price_id_monthly;

    if (!newPriceId) {
      throw new BadRequestException(
        `Plan ${newPlanKey} has no Stripe price configured for interval: ${currentInterval ?? 'monthly'}`,
      );
    }

    // Determine period boundaries from SubscriptionItem (Stripe API 2026-02-25 moved them here)
    const periodStart =
      currentItem.current_period_start ??
      (stripeSubscription as unknown as { current_period_start?: number })
        .current_period_start;
    const periodEnd =
      currentItem.current_period_end ??
      (stripeSubscription as unknown as { current_period_end?: number })
        .current_period_end;

    if (!periodStart || !periodEnd) {
      throw new BadRequestException(
        'Could not determine current billing period from Stripe subscription',
      );
    }

    // Create or update the Stripe Subscription Schedule. A schedule Stripe already attached (an
    // earlier attempt whose DB write failed) is reused rather than created again.
    let schedule: Stripe.SubscriptionSchedule;
    const existingScheduleId =
      subscription.stripe_schedule_id ??
      (typeof stripeSubscription.schedule === 'string'
        ? stripeSubscription.schedule
        : stripeSubscription.schedule?.id);

    if (existingScheduleId) {
      schedule = await this.stripeService.client.subscriptionSchedules.update(
        existingScheduleId,
        {
          end_behavior: 'release',
          phases: [
            {
              items: [{ price: currentPriceId, quantity: 1 }],
              start_date: periodStart,
              end_date: periodEnd,
            },
            {
              items: [{ price: newPriceId, quantity: 1 }],
              start_date: periodEnd,
            },
          ],
        },
      );
    } else {
      // Create a schedule from the existing subscription, then add the change phase
      const initialSchedule =
        await this.stripeService.client.subscriptionSchedules.create({
          from_subscription: subscription.stripe_subscription_id,
        });

      schedule = await this.stripeService.client.subscriptionSchedules.update(
        initialSchedule.id,
        {
          end_behavior: 'release',
          phases: [
            {
              items: [{ price: currentPriceId, quantity: 1 }],
              start_date: periodStart,
              end_date: periodEnd,
            },
            {
              items: [{ price: newPriceId, quantity: 1 }],
              start_date: periodEnd,
            },
          ],
        },
      );
    }

    // Resolve current plan key for the event payload
    const currentPlan =
      await this.plansRepository.findByStripePriceId(currentPriceId);

    const scheduledFor = new Date(periodEnd * 1000);

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          { stripe_schedule_id: schedule.id },
          { client },
        );

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.plan_change_scheduled',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_id: actorId,
            actor_type: 'user',
            payload: JSON.stringify({
              current_plan_key: currentPlan?.key ?? null,
              new_plan_key: newPlanKey,
              scheduled_for: scheduledFor.toISOString(),
              stripe_schedule_id: schedule.id,
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
            }),
          },
          { client },
        );
      },
    );

    this.logger.log(
      `Plan change scheduled: tenant=${tenantId}, new=${newPlanKey}, at=${scheduledFor.toISOString()}, schedule=${schedule.id}`,
    );

    return {
      scheduledFor,
      newPlanKey,
      currentPlanKey: currentPlan?.key ?? newPlanKey,
      stripeScheduleId: schedule.id,
    };
  }

  /**
   * Cancel a pending scheduled plan change by releasing the Stripe Subscription Schedule.
   * The subscription continues with its current plan.
   */
  async cancelScheduledPlanChange(tenantId: string): Promise<void> {
    const subscription = await this.findActiveSubscription(tenantId);

    if (!subscription?.stripe_schedule_id) {
      throw new BadRequestException('No pending plan change to cancel');
    }

    await this.stripeService.client.subscriptionSchedules.release(
      subscription.stripe_schedule_id,
    );

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          { stripe_schedule_id: null },
          { client },
        );

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.plan_change_cancelled',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_type: 'user',
            payload: JSON.stringify({
              stripe_schedule_id: subscription.stripe_schedule_id,
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
            }),
          },
          { client },
        );
      },
    );

    this.logger.log(
      `Scheduled plan change cancelled: tenant=${tenantId}, schedule=${subscription.stripe_schedule_id}`,
    );
  }

  /**
   * Returns info about any pending scheduled plan change for the tenant.
   * Queries Stripe to resolve the upcoming plan key and scheduled date.
   */
  async getPendingPlanChange(
    tenantId: string,
  ): Promise<PendingPlanChangeResult> {
    const subscription = await this.findActiveSubscription(tenantId);

    if (!subscription?.stripe_schedule_id) {
      return { hasPendingChange: false };
    }

    const schedule =
      await this.stripeService.client.subscriptionSchedules.retrieve(
        subscription.stripe_schedule_id,
      );

    if (schedule.status === 'released' || schedule.status === 'canceled') {
      // Schedule was released or cancelled externally — clean up our reference
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          await this.subscriptionsRepository.update(
            subscription.id,
            { stripe_schedule_id: null },
            { client },
          );
        },
      );
      return { hasPendingChange: false };
    }

    // Find the future phase (phases after the current one have a future start_date)
    const now = Math.floor(Date.now() / 1000);
    const futurePhase = schedule.phases.find(
      (phase) => typeof phase.start_date === 'number' && phase.start_date > now,
    );

    if (!futurePhase) {
      return { hasPendingChange: false };
    }

    // Resolve the plan from the future phase's price
    const futurePriceId =
      typeof futurePhase.items[0]?.price === 'string'
        ? futurePhase.items[0].price
        : (futurePhase.items[0]?.price as Stripe.Price | undefined)?.id;

    if (!futurePriceId) {
      return { hasPendingChange: false };
    }

    const futurePlan =
      await this.plansRepository.findByStripePriceId(futurePriceId);

    if (!futurePlan) {
      this.logger.warn(
        `Pending schedule ${subscription.stripe_schedule_id} references unknown price: ${futurePriceId}`,
      );
      return { hasPendingChange: false };
    }

    return {
      hasPendingChange: true,
      scheduledFor: new Date(futurePhase.start_date * 1000),
      newPlanKey: futurePlan.key,
      stripeScheduleId: subscription.stripe_schedule_id,
    };
  }

  /**
   * Schedule subscription cancellation at end of current billing period.
   * Tenant retains access until the period ends; Stripe fires customer.subscription.deleted
   * when the period actually expires, which triggers the Navigator downgrade.
   */
  async cancelSubscription(
    tenantId: string,
    actorId: string,
  ): Promise<{ cancelsAt: Date }> {
    const subscription = await this.findActiveSubscription(tenantId);

    if (!subscription?.stripe_subscription_id) {
      throw new BadRequestException('No active Stripe subscription to cancel');
    }

    const stripeSubscription =
      await this.stripeService.client.subscriptions.update(
        subscription.stripe_subscription_id,
        { cancel_at_period_end: true },
      );

    const firstItem = stripeSubscription.items.data[0];
    const periodEndTimestamp =
      firstItem?.current_period_end ??
      (stripeSubscription as unknown as { current_period_end?: number })
        .current_period_end;

    if (!periodEndTimestamp) {
      throw new BadRequestException(
        'Could not determine cancellation date from Stripe subscription',
      );
    }

    const cancelsAt = new Date(periodEndTimestamp * 1000);

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          {
            stripe_status: stripeSubscription.status,
            cancelled_at: new Date(),
            cancel_at_period_end: true,
          },
          { client },
        );

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.cancellation_scheduled',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_id: actorId,
            actor_type: 'user',
            payload: JSON.stringify({
              cancels_at: cancelsAt.toISOString(),
              stripe_subscription_id: stripeSubscription.id,
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
            }),
          },
          { client },
        );
      },
    );

    this.logger.log(
      `Subscription cancellation scheduled: tenant=${tenantId}, cancels_at=${cancelsAt.toISOString()}, stripe_sub=${stripeSubscription.id}`,
    );

    return { cancelsAt };
  }

  /**
   * Remove a pending end-of-period cancellation. The subscription continues unchanged.
   * Only valid before the period end; after customer.subscription.deleted fires, the
   * subscription is gone and cannot be reactivated through this flow.
   */
  async reactivateSubscription(
    tenantId: string,
    actorId: string,
  ): Promise<void> {
    const subscription = await this.findActiveSubscription(tenantId);

    if (!subscription?.stripe_subscription_id) {
      throw new BadRequestException('No active subscription to reactivate');
    }

    if (!subscription.cancel_at_period_end) {
      throw new BadRequestException(
        'Subscription does not have a pending cancellation',
      );
    }

    await this.stripeService.client.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: false },
    );

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          {
            cancelled_at: null,
            cancel_at_period_end: false,
          },
          { client },
        );

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.cancellation_revoked',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_id: actorId,
            actor_type: 'user',
            payload: JSON.stringify({
              stripe_subscription_id: subscription.stripe_subscription_id,
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
            }),
          },
          { client },
        );
      },
    );

    this.logger.log(
      `Subscription reactivated: tenant=${tenantId}, stripe_sub=${subscription.stripe_subscription_id}`,
    );
  }

  private findActiveSubscription(
    tenantId: string,
  ): Promise<TenantSubscription | null> {
    return this.subscriptionsRepository.findActiveByTenant(tenantId, {
      tenant: { tenantId, schema: 'public' },
    });
  }

  /**
   * Maps a Stripe subscription status string to our internal SubscriptionStatus type.
   * Delegates to the shared utility in stripe.utils.ts.
   */
  mapStripeStatus(stripeStatus: string) {
    return mapStripeStatusToInternal(stripeStatus);
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import {
  PlanKey,
  SubscriptionStatus,
} from 'src/common/types/entitlement.types';
import { DatabaseService } from 'src/database/database.service';
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
    const subscription =
      await this.subscriptionsRepository.findActiveByTenant(tenantId);

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

    // Create or update the Stripe Subscription Schedule
    let schedule: Stripe.SubscriptionSchedule;

    if (subscription.stripe_schedule_id) {
      schedule = await this.stripeService.client.subscriptionSchedules.update(
        subscription.stripe_schedule_id,
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
    const subscription =
      await this.subscriptionsRepository.findActiveByTenant(tenantId);

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
    const subscription =
      await this.subscriptionsRepository.findActiveByTenant(tenantId);

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
   * Maps a Stripe subscription status string to our internal SubscriptionStatus type.
   */
  mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
      case 'unpaid':
        return 'past_due';
      case 'canceled':
        return 'cancelled';
      default:
        return 'past_due';
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
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
import { StripeService } from 'src/modules/stripe/stripe.service';

@Injectable()
export class StripeEventHandlersService {
  private readonly logger = new Logger(StripeEventHandlersService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly stripeService: StripeService,
    private readonly plansRepository: PlansRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly entitlementSnapshotsRepository: EntitlementSnapshotsRepository,
    private readonly domainEventsService: DomainEventsService,
  ) {}

  async handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode !== 'subscription') {
      this.logger.log(
        `Skipping non-subscription checkout session: ${session.id} (mode: ${session.mode})`,
      );
      return;
    }

    const tenantId = session.metadata?.complytude_tenant_id;
    const planKey = session.metadata?.plan_key as PlanKey | undefined;

    if (!tenantId || !planKey) {
      throw new Error(
        `Missing required metadata in checkout.session.completed — ` +
          `event=${event.id}, session=${session.id}, ` +
          `tenantId=${tenantId ?? 'null'}, planKey=${planKey ?? 'null'}`,
      );
    }

    if (!session.subscription) {
      throw new Error(
        `No subscription ID on completed session ${session.id} (event: ${event.id})`,
      );
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const [stripeSub, plan] = await Promise.all([
      this.stripeService.client.subscriptions.retrieve(subscriptionId),
      this.plansRepository.findByKey(planKey),
    ]);

    if (!plan) {
      throw new Error(
        `Plan not found: ${planKey} (event: ${event.id}) — catalog sync may not have run`,
      );
    }

    // As of Stripe API 2026-02-25.clover, current_period_start/end moved from
    // the Subscription root to SubscriptionItem (items.data[0]).
    const firstItem = stripeSub.items.data[0];
    if (!firstItem?.current_period_start || !firstItem?.current_period_end) {
      throw new Error(
        `Stripe subscription ${subscriptionId} has no items or missing billing period — ` +
          `(event: ${event.id})`,
      );
    }

    const periodStart = new Date(firstItem.current_period_start * 1000);
    const periodEnd = new Date(firstItem.current_period_end * 1000);

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const subscription = await this.subscriptionsRepository.upsert(
          {
            tenant_id: tenantId,
            plan_id: plan.id,
            status: 'active',
            billing_period_start: periodStart,
            billing_period_end: periodEnd,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            stripe_subscription_id: subscriptionId,
            stripe_current_period_end: periodEnd,
            stripe_status: stripeSub.status,
            metadata: JSON.stringify({ source: 'stripe_checkout' }),
          },
          { client },
        );

        await this.entitlementSnapshotsRepository.invalidate(tenantId, {
          client,
        });

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.created',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_type: 'system',
            payload: JSON.stringify({
              subscription_id: subscription.id,
              plan_id: plan.id,
              plan_key: plan.key,
              stripe_subscription_id: subscriptionId,
              source: 'stripe_checkout',
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
              stripe_event_id: event.id,
              stripe_session_id: session.id,
            }),
          },
          { client },
        );
      },
    ); // platform admin context — webhook has no user context

    this.logger.log(
      `Subscription provisioned via checkout: tenant=${tenantId}, plan=${planKey}, stripe_sub=${subscriptionId}`,
    );
  }

  async handleSubscriptionChange(event: Stripe.Event): Promise<void> {
    const stripeSub = event.data.object as Stripe.Subscription;

    const subscription =
      await this.subscriptionsRepository.findByStripeSubscriptionId(
        stripeSub.id,
      );

    if (!subscription) {
      this.logger.warn(
        `${event.type}: no local subscription found for stripe_subscription_id=${stripeSub.id} (event=${event.id})`,
      );
      return;
    }

    const tenantId = subscription.tenant_id;

    if (event.type === 'customer.subscription.deleted') {
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          // Mark the paid subscription as cancelled
          await this.subscriptionsRepository.update(
            subscription.id,
            {
              status: 'cancelled',
              stripe_status: stripeSub.status,
              cancelled_at: new Date(),
              stripe_schedule_id: null,
            },
            { client },
          );

          // Downgrade to Navigator (free) plan — no Stripe subscription required
          const navigatorPlan = await this.plansRepository.findByKey(
            'navigator',
            { client },
          );

          if (!navigatorPlan) {
            throw new Error(
              `Navigator plan not found in DB — catalog sync may not have run (event: ${event.id})`,
            );
          }

          const now = new Date();
          const oneMonthLater = new Date(now);
          oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

          await this.subscriptionsRepository.upsert(
            {
              tenant_id: tenantId,
              plan_id: navigatorPlan.id,
              status: 'active',
              stripe_subscription_id: null,
              billing_period_start: now,
              billing_period_end: oneMonthLater,
              current_period_start: now,
              current_period_end: oneMonthLater,
              metadata: JSON.stringify({ downgraded_from_stripe: true }),
            },
            { client },
          );

          await this.entitlementSnapshotsRepository.invalidate(tenantId, {
            client,
          });

          await this.domainEventsService.emit(
            {
              tenant_id: tenantId,
              event_type: 'subscription.cancelled',
              aggregate_type: 'subscription',
              aggregate_id: subscription.id,
              actor_type: 'stripe',
              payload: JSON.stringify({
                old_plan_id: subscription.plan_id,
                downgraded_to: 'navigator',
                stripe_subscription_id: stripeSub.id,
                stripe_status: stripeSub.status,
              }),
              metadata: JSON.stringify({
                timestamp: new Date().toISOString(),
                stripe_event_id: event.id,
              }),
            },
            { client },
          );
        },
      );

      this.logger.log(
        `Subscription cancelled and downgraded to Navigator: tenant=${tenantId}, stripe_sub=${stripeSub.id}`,
      );
      return;
    }

    // customer.subscription.created or customer.subscription.updated
    const firstItem = stripeSub.items.data[0];
    if (!firstItem) {
      this.logger.warn(
        `${event.type}: stripe subscription ${stripeSub.id} has no items (event=${event.id})`,
      );
      return;
    }

    const currentPriceId =
      typeof firstItem.price === 'string'
        ? firstItem.price
        : firstItem.price.id;

    // Period dates moved to SubscriptionItem in Stripe API 2026-02-25
    const periodStart =
      firstItem.current_period_start ??
      (stripeSub as unknown as { current_period_start?: number })
        .current_period_start;
    const periodEnd =
      firstItem.current_period_end ??
      (stripeSub as unknown as { current_period_end?: number })
        .current_period_end;

    const newPlan =
      await this.plansRepository.findByStripePriceId(currentPriceId);
    const newStatus = this.mapStripeStatus(stripeSub.status);

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const oldPlanId = subscription.plan_id;
        const planChanged = newPlan && newPlan.id !== oldPlanId;

        await this.subscriptionsRepository.update(
          subscription.id,
          {
            ...(newPlan ? { plan_id: newPlan.id } : {}),
            status: newStatus,
            stripe_status: stripeSub.status,
            ...(periodStart
              ? { current_period_start: new Date(periodStart * 1000) }
              : {}),
            ...(periodEnd
              ? {
                  current_period_end: new Date(periodEnd * 1000),
                  stripe_current_period_end: new Date(periodEnd * 1000),
                }
              : {}),
            stripe_schedule_id: null, // clear any pending schedule
          },
          { client },
        );

        if (planChanged || newStatus !== subscription.status) {
          await this.entitlementSnapshotsRepository.invalidate(tenantId, {
            client,
          });
        }

        if (planChanged) {
          const oldPlan = await this.plansRepository.findById(oldPlanId, {
            client,
          });

          await this.domainEventsService.emit(
            {
              tenant_id: tenantId,
              event_type: 'subscription.plan_changed',
              aggregate_type: 'subscription',
              aggregate_id: subscription.id,
              actor_type: 'stripe',
              payload: JSON.stringify({
                old_plan_key: oldPlan?.key ?? null,
                new_plan_key: newPlan.key,
                stripe_status: stripeSub.status,
                source: 'scheduled_change',
              }),
              metadata: JSON.stringify({
                timestamp: new Date().toISOString(),
                stripe_event_id: event.id,
              }),
            },
            { client },
          );

          this.logger.log(
            `Plan changed via Stripe schedule: tenant=${tenantId}, new=${newPlan.key}, stripe_sub=${stripeSub.id}`,
          );
        } else {
          this.logger.log(
            `Subscription updated: tenant=${tenantId}, status=${stripeSub.status}, stripe_sub=${stripeSub.id}`,
          );
        }
      },
    );
  }

  async handleInvoicePaid(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    const stripeSubscriptionId = this.extractSubscriptionId(invoice);
    if (!stripeSubscriptionId) {
      this.logger.log(
        `invoice.paid: skipping non-subscription invoice ${invoice.id} (event: ${event.id})`,
      );
      return;
    }

    const subscription =
      await this.subscriptionsRepository.findByStripeSubscriptionId(
        stripeSubscriptionId,
      );

    if (!subscription) {
      this.logger.warn(
        `invoice.paid: no local subscription found for stripe_subscription_id=${stripeSubscriptionId} (event: ${event.id})`,
      );
      return;
    }

    const tenantId = subscription.tenant_id;

    const stripeSub =
      await this.stripeService.client.subscriptions.retrieve(
        stripeSubscriptionId,
      );

    const firstItem = stripeSub.items.data[0];
    if (!firstItem?.current_period_start || !firstItem?.current_period_end) {
      throw new Error(
        `invoice.paid: stripe subscription ${stripeSubscriptionId} has no items or missing billing period (event: ${event.id})`,
      );
    }

    const periodStart = new Date(firstItem.current_period_start * 1000);
    const periodEnd = new Date(firstItem.current_period_end * 1000);

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          {
            status: 'active',
            stripe_status: stripeSub.status,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            stripe_current_period_end: periodEnd,
          },
          { client },
        );

        // Invalidate snapshot — period advanced, usage counters reset context changes
        await this.entitlementSnapshotsRepository.invalidate(tenantId, {
          client,
        });

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.renewed',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_type: 'stripe',
            payload: JSON.stringify({
              invoice_id: invoice.id,
              amount_paid: invoice.amount_paid,
              currency: invoice.currency,
              new_period_start: periodStart,
              new_period_end: periodEnd,
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
              stripe_event_id: event.id,
            }),
          },
          { client },
        );
      },
    );

    this.logger.log(
      `Subscription renewed via invoice.paid: tenant=${tenantId}, stripe_sub=${stripeSubscriptionId}, period_end=${periodEnd.toISOString()}`,
    );
  }

  async handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    const stripeSubscriptionId = this.extractSubscriptionId(invoice);
    if (!stripeSubscriptionId) {
      this.logger.log(
        `invoice.payment_failed: skipping non-subscription invoice ${invoice.id} (event: ${event.id})`,
      );
      return;
    }

    const subscription =
      await this.subscriptionsRepository.findByStripeSubscriptionId(
        stripeSubscriptionId,
      );

    if (!subscription) {
      this.logger.warn(
        `invoice.payment_failed: no local subscription found for stripe_subscription_id=${stripeSubscriptionId} (event: ${event.id})`,
      );
      return;
    }

    const tenantId = subscription.tenant_id;

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          {
            status: 'past_due',
            stripe_status: 'past_due',
            metadata: JSON.stringify({
              ...(subscription.metadata ?? {}),
              last_payment_failure: {
                invoice_id: invoice.id,
                amount: invoice.amount_due,
                attempt_count: invoice.attempt_count,
                next_attempt: invoice.next_payment_attempt
                  ? new Date(invoice.next_payment_attempt * 1000)
                  : null,
                failed_at: new Date(),
              },
            }),
          },
          { client },
        );

        await this.entitlementSnapshotsRepository.invalidate(tenantId, {
          client,
        });

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.payment_failed',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_type: 'stripe',
            payload: JSON.stringify({
              invoice_id: invoice.id,
              amount_due: invoice.amount_due,
              attempt_count: invoice.attempt_count,
              next_attempt: invoice.next_payment_attempt,
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
              stripe_event_id: event.id,
            }),
          },
          { client },
        );
      },
    );

    this.logger.warn(
      `Payment failed: tenant=${tenantId}, stripe_sub=${stripeSubscriptionId}, attempt=${invoice.attempt_count}, invoice=${invoice.id}`,
    );
    // TODO: Send notification to tenant admin (email/in-app)
    // TODO: Queue BullMQ job for dunning email sequence
  }

  async handlePaymentActionRequired(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    const stripeSubscriptionId = this.extractSubscriptionId(invoice);
    if (!stripeSubscriptionId) {
      this.logger.log(
        `invoice.payment_action_required: skipping non-subscription invoice ${invoice.id} (event: ${event.id})`,
      );
      return;
    }

    const subscription =
      await this.subscriptionsRepository.findByStripeSubscriptionId(
        stripeSubscriptionId,
      );

    if (!subscription) {
      this.logger.warn(
        `invoice.payment_action_required: no local subscription found for stripe_subscription_id=${stripeSubscriptionId} (event: ${event.id})`,
      );
      return;
    }

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          {
            metadata: JSON.stringify({
              ...(subscription.metadata ?? {}),
              payment_action_required: {
                invoice_url: invoice.hosted_invoice_url,
                amount: invoice.amount_due,
                invoice_id: invoice.id,
                required_at: new Date(),
              },
            }),
          },
          { client },
        );
      },
    );

    this.logger.warn(
      `Payment action required: tenant=${subscription.tenant_id}, stripe_sub=${stripeSubscriptionId}, invoice_url=${invoice.hosted_invoice_url}`,
    );
    // TODO: Notify tenant admin with the invoice URL
  }

  /**
   * Stripe API 2026-02-25 moved `invoice.subscription` to
   * `invoice.parent.subscription_details.subscription`.
   * Returns the subscription ID string, or null for non-subscription invoices.
   */
  private extractSubscriptionId(invoice: Stripe.Invoice): string | null {
    const subscriptionRef = invoice.parent?.subscription_details?.subscription;
    if (!subscriptionRef) return null;
    return typeof subscriptionRef === 'string'
      ? subscriptionRef
      : subscriptionRef.id;
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
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

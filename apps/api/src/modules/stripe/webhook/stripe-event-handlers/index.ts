import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PlanKey } from 'src/common/types/entitlement.types';
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

    await this.databaseService.transactionWithPlatformAdminContext(async (client) => {
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
    }); // platform admin context — webhook has no user context

    this.logger.log(
      `Subscription provisioned via checkout: tenant=${tenantId}, plan=${planKey}, stripe_sub=${subscriptionId}`,
    );
  }

  handleSubscriptionChange(event: Stripe.Event): void {
    this.logger.log(`[STUB] ${event.type} — id: ${event.id}`);
  }

  handleInvoicePaid(event: Stripe.Event): void {
    this.logger.log(`[STUB] invoice.paid — id: ${event.id}`);
  }

  handleInvoicePaymentFailed(event: Stripe.Event): void {
    this.logger.log(`[STUB] invoice.payment_failed — id: ${event.id}`);
  }
}

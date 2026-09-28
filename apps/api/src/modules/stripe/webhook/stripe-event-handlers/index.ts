import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { DEFAULT_CURRENCY_LOWERCASE } from 'src/common/constants/billing.constant';
import {
  PlanKey,
  TenantSubscription,
} from 'src/common/types/entitlement.types';
import {
  getSubscriptionPeriod,
  mapStripeStatusToInternal,
} from '../../stripe.utils';
import { DatabaseService } from '@lib/database';
import { CreditLedgerService } from 'src/modules/entitlements/services/credit-ledger.service';
import { DomainEventsService } from 'src/modules/entitlements/services/domain-events.service';
import { EntitlementCacheService } from 'src/modules/entitlements/services/entitlement-cache.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { AddonsRepository } from 'src/repositories/entitlements/addons.repository';
import { EntitlementSnapshotsRepository } from 'src/repositories/entitlements/entitlement-snapshots.repository';
import { TenantAddonsRepository } from 'src/repositories/entitlements/tenant-addons.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import {
  QueueProducerService,
  QUEUE_NAMES,
  BILLING_JOB_NAMES,
  DunningEmailJobData,
  PaymentActionRequiredJobData,
} from '@lib/queue';
import type { PoolClient } from 'pg';
import { AddonSyncEngine } from '../../services/addon-sync-engine.service';

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
    private readonly addonsRepository: AddonsRepository,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly tenantsRepository: TenantRepository,
    private readonly queueProducer: QueueProducerService,
    private readonly addonSyncEngine: AddonSyncEngine,
    private readonly entitlementCache: EntitlementCacheService,
  ) {}

  async handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const checkoutType = session.metadata?.checkout_type;

    if (checkoutType === 'credit_purchase') {
      return this.handleCreditPurchaseCheckout(session, event.id);
    }

    // Route subscription checkouts — accept both the tagged type and legacy
    // sessions that predate the checkout_type metadata field.
    if (
      checkoutType !== 'subscription_checkout' &&
      session.mode !== 'subscription'
    ) {
      this.logger.log(
        `Skipping unrecognised checkout session: ${session.id} (mode: ${session.mode}, checkout_type: ${checkoutType ?? 'none'})`,
      );
      return;
    }

    return this.handleSubscriptionCheckout(session, event);
  }

  private async handleSubscriptionCheckout(
    session: Stripe.Checkout.Session,
    event: Stripe.Event,
  ): Promise<void> {
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

    const period = getSubscriptionPeriod(stripeSub);
    if (!period) {
      throw new Error(
        `Stripe subscription ${subscriptionId} has no items or missing billing period — ` +
          `(event: ${event.id})`,
      );
    }

    const { start: periodStart, end: periodEnd } = period;

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const rawInterval = session.metadata?.interval;
        const billingInterval: 'monthly' | 'annual' | undefined =
          rawInterval === 'monthly' || rawInterval === 'annual'
            ? rawInterval
            : undefined;

        const subscription = await this.subscriptionsRepository.upsert(
          {
            tenant_id: tenantId,
            plan_id: plan.id,
            status: 'active',
            billing_period_start: periodStart,
            billing_period_end: periodEnd,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            billing_interval: billingInterval,
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

        // Invalidate subscription cache since new subscription was created
        this.entitlementCache.invalidateSubscription(tenantId);

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

  private async handleCreditPurchaseCheckout(
    session: Stripe.Checkout.Session,
    eventId: string,
  ): Promise<void> {
    const tenantId = session.metadata?.complytude_tenant_id;
    const creditsAmount = parseInt(session.metadata?.credits_amount ?? '0', 10);
    const packageKey = session.metadata?.credit_package_key;

    if (!tenantId || !creditsAmount || !packageKey) {
      throw new Error(
        `Missing metadata on credit purchase session — ` +
          `event=${eventId}, session=${session.id}, ` +
          `tenantId=${tenantId ?? 'null'}, credits=${creditsAmount}, package=${packageKey ?? 'null'}`,
      );
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    // One checkout session grants its credits once, however often the event is processed
    await this.creditLedgerService.purchase({
      tenantId,
      amount: creditsAmount,
      idempotencyKey: `checkout:${session.id}`,
      stripePaymentIntentId: paymentIntentId,
      metadata: {
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        credit_package_key: packageKey,
        amount_paid: session.amount_total,
        currency: session.currency,
      },
    });

    this.logger.log(
      `Credits purchased via checkout: tenant=${tenantId}, package=${packageKey}, credits=${creditsAmount}, session=${session.id}`,
    );
  }

  async handleSubscriptionChange(event: Stripe.Event): Promise<void> {
    const eventSubscription = event.data.object as Stripe.Subscription;
    // Events can arrive late, twice or out of order, so apply the subscription's current state
    // in Stripe rather than the event's snapshot.
    const stripeSub = await this.stripeService.client.subscriptions.retrieve(
      eventSubscription.id,
    );

    const subscription =
      (await this.databaseService.transactionWithPlatformAdminContext(
        (client) =>
          this.subscriptionsRepository.findByStripeSubscriptionId(
            stripeSub.id,
            { client },
          ),
      )) ?? (await this.adoptSubscription(stripeSub, event));

    if (!subscription) {
      return;
    }

    const tenantId = subscription.tenant_id;

    if (stripeSub.status === 'canceled') {
      if (subscription.status === 'cancelled') {
        this.logger.log(
          `${event.type}: stripe subscription ${stripeSub.id} is already cancelled locally (event=${event.id})`,
        );
        return;
      }

      const replacement =
        await this.databaseService.transactionWithPlatformAdminContext(
          async (client) => {
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

            // A newer subscription (e.g. from a second checkout) may still be paying: it keeps its
            // plan and its add-ons, and only this subscription's add-ons are cancelled
            const replacement =
              await this.subscriptionsRepository.findCurrentByTenant(tenantId, {
                client,
              });
            const deletedItemIds = new Set(
              stripeSub.items.data.map((item) => item.id),
            );
            const activeAddons =
              await this.tenantAddonsRepository.findActiveByTenant(tenantId, {
                client,
              });
            const addonsToCancel = activeAddons.filter((addon) =>
              addon.stripe_subscription_item_id
                ? deletedItemIds.has(addon.stripe_subscription_item_id)
                : !replacement,
            );
            for (const addon of addonsToCancel) {
              await this.tenantAddonsRepository.update(
                addon.id,
                { status: 'cancelled' },
                { client },
              );
            }
            if (addonsToCancel.length > 0) {
              this.logger.log(
                `Cancelled ${addonsToCancel.length} add-on(s) on subscription deletion: tenant=${tenantId}`,
              );
            }

            if (!replacement) {
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
                  downgraded_from_stripe: true,
                },
                { client },
              );
            }

            await this.entitlementSnapshotsRepository.invalidate(tenantId, {
              client,
            });

            this.entitlementCache.invalidateSubscription(tenantId);

            await this.domainEventsService.emit(
              {
                tenant_id: tenantId,
                event_type: 'subscription.cancelled',
                aggregate_type: 'subscription',
                aggregate_id: subscription.id,
                actor_type: 'stripe',
                payload: JSON.stringify({
                  old_plan_id: subscription.plan_id,
                  downgraded_to: replacement ? null : 'navigator',
                  still_subscribed_via: replacement?.id ?? null,
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

            return replacement;
          },
        );

      this.logger.log(
        replacement
          ? `Subscription cancelled; tenant keeps subscription ${replacement.id}: tenant=${tenantId}, stripe_sub=${stripeSub.id}`
          : `Subscription cancelled and downgraded to Navigator: tenant=${tenantId}, stripe_sub=${stripeSub.id}`,
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

    const period = getSubscriptionPeriod(stripeSub);

    const newStatus = mapStripeStatusToInternal(stripeSub.status);

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const newPlan = await this.plansRepository.findByStripePriceId(
          currentPriceId,
          { client },
        );

        const oldPlanId = subscription.plan_id;
        const planChanged = newPlan && newPlan.id !== oldPlanId;

        await this.subscriptionsRepository.update(
          subscription.id,
          {
            ...(newPlan ? { plan_id: newPlan.id } : {}),
            status: newStatus,
            stripe_status: stripeSub.status,
            ...(period
              ? {
                  current_period_start: period.start,
                  current_period_end: period.end,
                  stripe_current_period_end: period.end,
                }
              : {}),
            stripe_schedule_id: null,
          },
          { client },
        );

        const addonsChanged = await this.syncAddonItems(
          tenantId,
          stripeSub,
          event.id,
          client,
        );

        if (planChanged || newStatus !== subscription.status || addonsChanged) {
          await this.entitlementSnapshotsRepository.invalidate(tenantId, {
            client,
          });

          this.entitlementCache.invalidateSubscription(tenantId);
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

  /**
   * Attaches a live Stripe subscription that has no local row (created in the Dashboard, or its
   * event arrived before checkout completed) to its tenant: the tenant ID in its metadata, else
   * the tenant that owns its Stripe customer. Returns null when there is nothing to adopt.
   */
  private async adoptSubscription(
    stripeSub: Stripe.Subscription,
    event: Stripe.Event,
  ): Promise<TenantSubscription | null> {
    if (stripeSub.status !== 'active' && stripeSub.status !== 'trialing') {
      this.logger.log(
        `${event.type}: no local subscription for ${stripeSub.id} and its Stripe status is ${stripeSub.status}; nothing to adopt (event=${event.id})`,
      );
      return null;
    }

    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id;
    const tenantId =
      stripeSub.metadata?.complytude_tenant_id ??
      (
        await this.databaseService.transactionWithPlatformAdminContext(
          (client) =>
            this.tenantsRepository.findByStripeCustomerId(customerId, {
              client,
            }),
        )
      )?.id;

    if (!tenantId) {
      this.logger.warn(
        `${event.type}: stripe subscription ${stripeSub.id} (customer ${customerId}) belongs to no known tenant (event=${event.id})`,
      );
      return null;
    }

    const firstItem = stripeSub.items.data[0];
    const priceId =
      typeof firstItem?.price === 'string'
        ? firstItem.price
        : firstItem?.price.id;
    const [plan, period] = [
      priceId ? await this.plansRepository.findByStripePriceId(priceId) : null,
      getSubscriptionPeriod(stripeSub),
    ];
    if (!plan || !period) {
      throw new Error(
        `Cannot adopt stripe subscription ${stripeSub.id} for tenant ${tenantId}: ` +
          `unknown price ${priceId ?? 'none'} or no billing period (event=${event.id})`,
      );
    }

    const rawInterval = stripeSub.metadata?.interval;
    const billingInterval: 'monthly' | 'annual' | undefined =
      rawInterval === 'monthly' || rawInterval === 'annual'
        ? rawInterval
        : undefined;

    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const current = await this.subscriptionsRepository.findActiveByTenant(
          tenantId,
          { client },
        );
        if (
          current?.stripe_subscription_id &&
          current.stripe_subscription_id !== stripeSub.id
        ) {
          this.logger.warn(
            `${event.type}: tenant ${tenantId} already has stripe subscription ${current.stripe_subscription_id}; not adopting ${stripeSub.id} (event=${event.id})`,
          );
          return null;
        }

        const subscription = await this.subscriptionsRepository.upsert(
          {
            tenant_id: tenantId,
            plan_id: plan.id,
            status: mapStripeStatusToInternal(stripeSub.status),
            billing_period_start: period.start,
            billing_period_end: period.end,
            current_period_start: period.start,
            current_period_end: period.end,
            billing_interval: billingInterval,
            stripe_subscription_id: stripeSub.id,
            stripe_current_period_end: period.end,
            stripe_status: stripeSub.status,
            metadata: JSON.stringify({ source: 'stripe_subscription_event' }),
          },
          { client },
        );

        await this.entitlementSnapshotsRepository.invalidate(tenantId, {
          client,
        });
        this.entitlementCache.invalidateSubscription(tenantId);

        await this.domainEventsService.emit(
          {
            tenant_id: tenantId,
            event_type: 'subscription.created',
            aggregate_type: 'subscription',
            aggregate_id: subscription.id,
            actor_type: 'stripe',
            payload: JSON.stringify({
              subscription_id: subscription.id,
              plan_id: plan.id,
              plan_key: plan.key,
              stripe_subscription_id: stripeSub.id,
              source: 'stripe_subscription_event',
            }),
            metadata: JSON.stringify({
              timestamp: new Date().toISOString(),
              stripe_event_id: event.id,
            }),
          },
          { client },
        );

        this.logger.log(
          `Adopted stripe subscription ${stripeSub.id} for tenant ${tenantId} (plan=${plan.key}, event=${event.id})`,
        );
        return subscription;
      },
    );
  }

  /**
   * Reconcile tenant_addons with the current Stripe subscription items.
   *
   * Uses the shared AddonSyncEngine to eliminate code duplication with
   * the reconciliation service. Returns true if any change was made.
   *
   * Note: This runs inside an existing platform-admin transaction — all mutations
   * share the same client and will roll back together on failure.
   */
  private async syncAddonItems(
    tenantId: string,
    stripeSub: Stripe.Subscription,
    eventId: string,
    client: PoolClient,
  ): Promise<boolean> {
    return this.addonSyncEngine.syncAddons(tenantId, stripeSub, {
      tenantId,
      client,
      context: 'webhook',
      eventId,
    });
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
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.subscriptionsRepository.findByStripeSubscriptionId(
          stripeSubscriptionId,
          { client },
        ),
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

    if (stripeSub.status === 'canceled') {
      this.logger.log(
        `invoice.paid: stripe subscription ${stripeSubscriptionId} is canceled; the deletion event handles it (event: ${event.id})`,
      );
      return;
    }

    const period = getSubscriptionPeriod(stripeSub);
    if (!period) {
      throw new Error(
        `invoice.paid: stripe subscription ${stripeSubscriptionId} has no items or missing billing period (event: ${event.id})`,
      );
    }

    const { start: periodStart, end: periodEnd } = period;

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          {
            // Another open invoice can keep the subscription past_due, so take Stripe's status
            status: mapStripeStatusToInternal(stripeSub.status),
            stripe_status: stripeSub.status,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            stripe_current_period_end: periodEnd,
          },
          { client },
        );

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
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.subscriptionsRepository.findByStripeSubscriptionId(
          stripeSubscriptionId,
          { client },
        ),
      );

    if (!subscription) {
      this.logger.warn(
        `invoice.payment_failed: no local subscription found for stripe_subscription_id=${stripeSubscriptionId} (event: ${event.id})`,
      );
      return;
    }

    const tenantId = subscription.tenant_id;

    // The failure may already be recovered (a later retry paid the invoice) by the time this runs
    const [stripeSub, currentInvoice] = await Promise.all([
      this.stripeService.client.subscriptions.retrieve(stripeSubscriptionId),
      this.stripeService.client.invoices.retrieve(invoice.id),
    ]);

    if (stripeSub.status === 'canceled') {
      this.logger.log(
        `invoice.payment_failed: stripe subscription ${stripeSubscriptionId} is canceled; the deletion event handles it (event: ${event.id})`,
      );
      return;
    }

    const stillUnpaid = currentInvoice.status === 'open';

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.subscriptionsRepository.update(
          subscription.id,
          {
            status: mapStripeStatusToInternal(stripeSub.status),
            stripe_status: stripeSub.status,
            ...(stillUnpaid
              ? {
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
                }
              : {}),
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
              invoice_status: currentInvoice.status,
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

    if (!stillUnpaid) {
      this.logger.log(
        `Payment failure already resolved (invoice ${invoice.id} is ${currentInvoice.status}): tenant=${tenantId}, no dunning`,
      );
      return;
    }

    this.logger.warn(
      `Payment failed: tenant=${tenantId}, stripe_sub=${stripeSubscriptionId}, attempt=${invoice.attempt_count}, invoice=${invoice.id}`,
    );

    // Queue dunning email sequence
    await this.queueDunningEmailSequence(
      tenantId,
      stripeSubscriptionId,
      invoice,
    );
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
      await this.databaseService.transactionWithPlatformAdminContext((client) =>
        this.subscriptionsRepository.findByStripeSubscriptionId(
          stripeSubscriptionId,
          { client },
        ),
      );

    if (!subscription) {
      this.logger.warn(
        `invoice.payment_action_required: no local subscription found for stripe_subscription_id=${stripeSubscriptionId} (event: ${event.id})`,
      );
      return;
    }

    const currentInvoice = await this.stripeService.client.invoices.retrieve(
      invoice.id,
    );
    if (currentInvoice.status !== 'open') {
      this.logger.log(
        `invoice.payment_action_required: invoice ${invoice.id} is ${currentInvoice.status}; nothing to ask for (event: ${event.id})`,
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

    await this.queuePaymentActionRequiredEmail(
      subscription.tenant_id,
      stripeSubscriptionId,
      invoice,
    );
  }

  /**
   * Queue payment action required email (3D Secure, etc.) to tenant admin.
   */
  private async queuePaymentActionRequiredEmail(
    tenantId: string,
    stripeSubscriptionId: string,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    try {
      const [tenantAdminEmail, tenant] = await Promise.all([
        this.databaseService.transactionWithPlatformAdminContext((client) =>
          this.userTenantRepository.findTenantAdminEmail(tenantId, { client }),
        ),
        this.databaseService.transactionWithPlatformAdminContext((client) =>
          this.tenantsRepository.findById(tenantId, { client }),
        ),
      ]);

      if (!tenantAdminEmail) {
        this.logger.warn(
          `No tenant admin email found for tenant ${tenantId}, skipping payment action required email`,
        );
        return;
      }

      if (!invoice.hosted_invoice_url) {
        this.logger.warn(
          `No hosted invoice URL for invoice ${invoice.id}, skipping payment action required email`,
        );
        return;
      }

      const jobData: PaymentActionRequiredJobData = {
        tenantId,
        tenantAdminEmail,
        stripeSubscriptionId,
        invoiceId: invoice.id,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        amount: invoice.amount_due || 0,
        currency: invoice.currency || DEFAULT_CURRENCY_LOWERCASE,
        tenantName: tenant?.name || undefined,
      };

      await this.queueProducer.enqueue(
        QUEUE_NAMES.BILLING_PROCESSING,
        BILLING_JOB_NAMES.PAYMENT_ACTION_REQUIRED,
        jobData,
        {
          delay: 0,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(
        `Payment action required email queued for tenant ${tenantId}, invoice ${invoice.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue payment action required email for tenant ${tenantId}, invoice ${invoice.id}`,
        error.stack,
      );
      // Don't re-throw - webhook processing should not fail due to email issues
    }
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

  /**
   * Queue dunning email sequence for failed payment.
   * Schedules emails for Day 0 (immediate), Day 3, and Day 5.
   */
  private async queueDunningEmailSequence(
    tenantId: string,
    stripeSubscriptionId: string,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    try {
      const [tenantAdminEmail, tenant] = await Promise.all([
        this.databaseService.transactionWithPlatformAdminContext((client) =>
          this.userTenantRepository.findTenantAdminEmail(tenantId, { client }),
        ),
        this.databaseService.transactionWithPlatformAdminContext((client) =>
          this.tenantsRepository.findById(tenantId, { client }),
        ),
      ]);

      if (!tenantAdminEmail) {
        this.logger.warn(
          `No tenant admin email found for tenant ${tenantId}, skipping dunning emails`,
        );
        return;
      }

      if (!invoice.hosted_invoice_url) {
        this.logger.warn(
          `No hosted invoice URL for invoice ${invoice.id}, skipping dunning emails`,
        );
        return;
      }

      const baseJobData: Omit<DunningEmailJobData, 'dunningSequence'> = {
        tenantId,
        tenantAdminEmail,
        stripeSubscriptionId,
        invoiceId: invoice.id,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        attemptCount: invoice.attempt_count || 1,
        amount: invoice.amount_due || 0,
        currency: invoice.currency || DEFAULT_CURRENCY_LOWERCASE,
        dueDate: invoice.due_date
          ? new Date(invoice.due_date * 1000).toISOString()
          : new Date().toISOString(),
        tenantName: tenant?.name || undefined,
      };

      // Day 0: Send immediately
      await this.queueProducer.enqueue(
        QUEUE_NAMES.BILLING_PROCESSING,
        BILLING_JOB_NAMES.DUNNING_EMAIL,
        {
          ...baseJobData,
          dunningSequence: 'day0' as const,
        },
        {
          delay: 0, // Send immediately
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      // Day 3: Send after 3 days
      await this.queueProducer.enqueue(
        QUEUE_NAMES.BILLING_PROCESSING,
        BILLING_JOB_NAMES.DUNNING_EMAIL,
        {
          ...baseJobData,
          dunningSequence: 'day3' as const,
        },
        {
          delay: 3 * 24 * 60 * 60 * 1000, // 3 days in milliseconds
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      // Day 5: Send after 5 days
      await this.queueProducer.enqueue(
        QUEUE_NAMES.BILLING_PROCESSING,
        BILLING_JOB_NAMES.DUNNING_EMAIL,
        {
          ...baseJobData,
          dunningSequence: 'day5' as const,
        },
        {
          delay: 5 * 24 * 60 * 60 * 1000, // 5 days in milliseconds
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      this.logger.log(
        `Dunning email sequence queued for tenant ${tenantId}, invoice ${invoice.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue dunning email sequence for tenant ${tenantId}, invoice ${invoice.id}`,
        error.stack,
      );
      // Don't re-throw - we don't want webhook processing to fail due to dunning email issues
    }
  }
}

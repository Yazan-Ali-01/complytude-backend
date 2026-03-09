import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { DEFAULT_CURRENCY_LOWERCASE } from 'src/common/constants/billing.constant';
import { PlanKey } from 'src/common/types/entitlement.types';
import { mapStripeStatusToInternal } from '../../stripe.utils';
import { DatabaseService } from 'src/database/database.service';
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

    await this.creditLedgerService.purchase(tenantId, creditsAmount, {
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      credit_package_key: packageKey,
      amount_paid: session.amount_total,
      currency: session.currency,
    });

    this.logger.log(
      `Credits purchased via checkout: tenant=${tenantId}, package=${packageKey}, credits=${creditsAmount}, session=${session.id}`,
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

          // Cancel all active add-ons — subscription is gone, add-ons are gone too
          const activeAddons =
            await this.tenantAddonsRepository.findActiveByTenant(tenantId, {
              client,
            });
          for (const addon of activeAddons) {
            await this.tenantAddonsRepository.update(
              addon.id,
              { status: 'cancelled' },
              { client },
            );
          }
          if (activeAddons.length > 0) {
            this.logger.log(
              `Cancelled ${activeAddons.length} add-on(s) on subscription deletion: tenant=${tenantId}`,
            );
          }

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

          // Invalidate subscription cache since subscription changed
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
    const newStatus = mapStripeStatusToInternal(stripeSub.status);

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

        // Reconcile add-on subscription items with Stripe
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
          
          // Invalidate subscription cache since subscription changed
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
      // Get tenant admin email and tenant info
      // Note: These queries run without tenant context since this is a system webhook
      const [tenantAdminEmail, tenant] = await Promise.all([
        this.userTenantRepository.findTenantAdminEmail(tenantId),
        this.tenantsRepository.findById(tenantId),
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

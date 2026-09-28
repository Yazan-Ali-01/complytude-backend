import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { Logger } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { StripeWebhookMonitoringService } from 'src/modules/stripe/services/stripe-webhook-monitoring.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { StripeWebhookController } from 'src/modules/stripe/webhook/stripe-webhook.controller';
import { StripeWebhookService } from 'src/modules/stripe/webhook/stripe-webhook.service';
import { createTestSubscription, createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const SHIELD_PRICE = 'price_test_webhooks_shield';
const INFRASTRUCTURE_PRICE = 'price_test_webhooks_infrastructure';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

interface FakeSubscription {
  id: string;
  object: 'subscription';
  status: Stripe.Subscription.Status;
  customer: string;
  metadata: Record<string, string>;
  cancel_at_period_end: boolean;
  items: {
    data: {
      id: string;
      price: { id: string; recurring: { interval: 'month' } };
      quantity: number;
      current_period_start: number;
      current_period_end: number;
    }[];
  };
}

/** Stripe's current state for the objects the handlers re-fetch, and a switchable outage. */
class FakeStripe {
  readonly subscriptions = new Map<string, FakeSubscription>();
  readonly invoices = new Map<
    string,
    { id: string; status: Stripe.Invoice.Status }
  >();
  outage = false;
  readonly periodStart = Math.floor(Date.now() / 1000) - 5 * 86400;
  readonly periodEnd = Math.floor(Date.now() / 1000) + 25 * 86400;

  subscription(
    id: string,
    priceId: string,
    status: Stripe.Subscription.Status,
    metadata: Record<string, string> = {},
  ): FakeSubscription {
    return {
      id,
      object: 'subscription',
      status,
      customer: `cus_${id}`,
      metadata,
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: `si_${id}`,
            price: { id: priceId, recurring: { interval: 'month' } },
            quantity: 1,
            current_period_start: this.periodStart,
            current_period_end: this.periodEnd,
          },
        ],
      },
    };
  }

  private available(): void {
    if (this.outage)
      throw new Error('Stripe is unavailable (simulated outage)');
  }

  readonly client = {
    subscriptions: {
      retrieve: (id: string): Promise<FakeSubscription> => {
        this.available();
        const subscription = this.subscriptions.get(id);
        if (!subscription) throw new Error(`No such subscription: ${id}`);
        return Promise.resolve(subscription);
      },
    },
    invoices: {
      retrieve: (
        id: string,
      ): Promise<{ id: string; status: Stripe.Invoice.Status }> => {
        this.available();
        const invoice = this.invoices.get(id);
        if (!invoice) throw new Error(`No such invoice: ${id}`);
        return Promise.resolve(invoice);
      },
    },
  };
}

function stripeEvent(
  type: string,
  object: object,
  createdSecondsAgo = 0,
): Stripe.Event {
  return {
    id: `evt_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    type,
    api_version: '2026-02-25.clover',
    created: Math.floor(Date.now() / 1000) - createdSecondsAgo,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  } as unknown as Stripe.Event;
}

/**
 * Stripe webhook processing: replays, duplicate deliveries, out-of-order events and failures
 * must all converge on the right final state.
 */
describe('Stripe webhooks: idempotency, ordering and re-drive', () => {
  let app: TestApp;
  let stripe: FakeStripe;
  let webhooks: StripeWebhookService;
  let savedPrices: { key: string; monthly: string | null }[];
  const signer = new Stripe('sk_test_webhook_signer');

  beforeAll(async () => {
    stripe = new FakeStripe();
    app = await createTestApp({
      providers: [
        {
          provide: StripeService,
          useValue: {
            client: stripe.client,
            constructWebhookEvent: (
              payload: Buffer,
              signature: string,
            ): Stripe.Event =>
              signer.webhooks.constructEvent(
                payload,
                signature,
                WEBHOOK_SECRET,
              ),
          },
        },
      ],
    });
    webhooks = app.module.get(StripeWebhookService);

    savedPrices = (
      await app.databaseService.query<{ key: string; monthly: string | null }>(
        `SELECT key, stripe_price_id_monthly AS monthly FROM public.plans WHERE key IN ('shield', 'infrastructure')`,
      )
    ).rows;
    await app.databaseService.query(
      `UPDATE public.plans SET stripe_price_id_monthly = CASE key WHEN 'shield' THEN $1 ELSE $2 END
       WHERE key IN ('shield', 'infrastructure')`,
      [SHIELD_PRICE, INFRASTRUCTURE_PRICE],
    );
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    stripe.subscriptions.clear();
    stripe.invoices.clear();
    stripe.outage = false;
  }, 15000);

  afterAll(async () => {
    if (app) {
      for (const { key, monthly } of savedPrices ?? []) {
        await app.databaseService.query(
          'UPDATE public.plans SET stripe_price_id_monthly = $2 WHERE key = $1',
          [key, monthly],
        );
      }
      await app.cleanup();
    }
  }, 30000);

  /** Delivers an event to the webhook endpoint as Stripe would (signed raw body). */
  async function deliver(event: Stripe.Event): Promise<void> {
    const payload = JSON.stringify(event);
    const signature = signer.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    await app.module
      .get(StripeWebhookController)
      .handleWebhook(
        { rawBody: Buffer.from(payload) } as unknown as FastifyRequest,
        signature,
      );
  }

  async function billingQueueIdle(): Promise<void> {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.BILLING_PROCESSING)),
      15000,
    );
  }

  async function eventRow(
    eventId: string,
  ): Promise<{ processing_status: string; attempts: number }> {
    const result = await app.databaseService.query<{
      processing_status: string;
      attempts: number;
    }>(
      'SELECT processing_status, attempts FROM public.stripe_webhook_events WHERE stripe_event_id = $1',
      [eventId],
    );
    return result.rows[0];
  }

  async function subscriptionOf(tenantId: string): Promise<{
    plan_key: string;
    status: string;
    stripe_subscription_id: string | null;
    metadata: Record<string, unknown>;
  }> {
    const result = await app.databaseService.query<{
      plan_key: string;
      status: string;
      stripe_subscription_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT p.key AS plan_key, s.status, s.stripe_subscription_id, s.metadata
       FROM public.tenant_subscriptions s JOIN public.plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1 AND s.status <> 'cancelled'`,
      [tenantId],
    );
    expect(result.rows).toHaveLength(1);
    return result.rows[0];
  }

  /** A tenant on Shield, billed through the fake Stripe subscription it returns. */
  async function stripeBackedTenant(): Promise<{
    tenantId: string;
    stripeSubscriptionId: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    const stripeSubscriptionId = `sub_test_${randomUUID()}`;
    await app.databaseService.query(
      'UPDATE public.tenant_subscriptions SET stripe_subscription_id = $2 WHERE tenant_id = $1',
      [tenant.id, stripeSubscriptionId],
    );
    stripe.subscriptions.set(
      stripeSubscriptionId,
      stripe.subscription(stripeSubscriptionId, SHIELD_PRICE, 'active'),
    );
    return { tenantId: tenant.id, stripeSubscriptionId };
  }

  describe('idempotency', () => {
    function creditPurchase(tenantId: string): {
      event: Stripe.Event;
      sessionId: string;
    } {
      const sessionId = `cs_test_${randomUUID()}`;
      return {
        sessionId,
        event: stripeEvent('checkout.session.completed', {
          id: sessionId,
          object: 'checkout.session',
          mode: 'payment',
          payment_intent: `pi_${sessionId}`,
          amount_total: 5000,
          currency: 'aed',
          metadata: {
            checkout_type: 'credit_purchase',
            complytude_tenant_id: tenantId,
            credits_amount: '100',
            credit_package_key: 'test_pack',
          },
        }),
      };
    }

    async function purchases(
      tenantId: string,
    ): Promise<{ amount: number; stripe_payment_intent_id: string | null }[]> {
      const result = await app.databaseService.query<{
        amount: number;
        stripe_payment_intent_id: string | null;
      }>(
        `SELECT amount, stripe_payment_intent_id FROM public.credit_ledger
         WHERE tenant_id = $1 AND transaction_type = 'purchase'`,
        [tenantId],
      );
      return result.rows;
    }

    it('delivering the same event twice grants credits once', async () => {
      const tenant = await createTestTenant(app.module);
      const { event, sessionId } = creditPurchase(tenant.id);

      await deliver(event);
      await deliver(event);
      await billingQueueIdle();

      expect(await purchases(tenant.id)).toEqual([
        { amount: 100, stripe_payment_intent_id: `pi_${sessionId}` },
      ]);
      expect(await eventRow(event.id)).toEqual({
        processing_status: 'completed',
        attempts: 1,
      });
      const { rows } = await app.databaseService.query<{ deliveries: number }>(
        'SELECT deliveries FROM public.stripe_webhook_events WHERE stripe_event_id = $1',
        [event.id],
      );
      expect(rows[0].deliveries).toBe(2);
    });

    it('re-processing after the completion mark was lost grants credits once', async () => {
      const tenant = await createTestTenant(app.module);
      const { event } = creditPurchase(tenant.id);
      await webhooks.processEvent(event);
      // The purchase committed but marking the event completed did not (crash, DB blip)
      await app.databaseService.query(
        `UPDATE public.stripe_webhook_events SET processing_status = 'failed' WHERE stripe_event_id = $1`,
        [event.id],
      );

      await webhooks.processEvent(event);

      expect(await purchases(tenant.id)).toHaveLength(1);
    });

    it('two workers processing the same event concurrently grant credits once', async () => {
      const tenant = await createTestTenant(app.module);
      const { event } = creditPurchase(tenant.id);

      await Promise.allSettled([
        webhooks.processEvent(event),
        webhooks.processEvent(event),
      ]);

      expect(await purchases(tenant.id)).toHaveLength(1);
    });
  });

  describe('ordering', () => {
    function subscriptionUpdated(
      subscription: FakeSubscription,
      createdSecondsAgo: number,
    ): Stripe.Event {
      return stripeEvent(
        'customer.subscription.updated',
        subscription,
        createdSecondsAgo,
      );
    }

    it('a late subscription.updated does not roll back a newer plan and status', async () => {
      const { tenantId, stripeSubscriptionId } = await stripeBackedTenant();
      const older = subscriptionUpdated(
        stripe.subscription(stripeSubscriptionId, SHIELD_PRICE, 'past_due'),
        120,
      );
      const newer = subscriptionUpdated(
        stripe.subscription(
          stripeSubscriptionId,
          INFRASTRUCTURE_PRICE,
          'active',
        ),
        60,
      );
      // Stripe's current state is the newer one
      stripe.subscriptions.set(
        stripeSubscriptionId,
        stripe.subscription(
          stripeSubscriptionId,
          INFRASTRUCTURE_PRICE,
          'active',
        ),
      );

      await webhooks.processEvent(newer);
      await webhooks.processEvent(older);

      expect(await subscriptionOf(tenantId)).toMatchObject({
        plan_key: 'infrastructure',
        status: 'active',
      });
    });

    it('invoice.payment_failed handled after the invoice was paid leaves the tenant active', async () => {
      const { tenantId, stripeSubscriptionId } = await stripeBackedTenant();
      const invoiceId = `in_${randomUUID()}`;
      stripe.invoices.set(invoiceId, { id: invoiceId, status: 'paid' });
      const failed = stripeEvent(
        'invoice.payment_failed',
        {
          id: invoiceId,
          object: 'invoice',
          status: 'open',
          amount_due: 5000,
          attempt_count: 1,
          next_payment_attempt: null,
          hosted_invoice_url: null,
          currency: 'aed',
          parent: {
            subscription_details: { subscription: stripeSubscriptionId },
          },
        },
        300,
      );

      await webhooks.processEvent(failed);

      const subscription = await subscriptionOf(tenantId);
      expect(subscription.status).toBe('active');
      expect(subscription.metadata.last_payment_failure).toBeUndefined();
    });

    it('routes a subscription it has no row for by its tenant metadata instead of dropping it', async () => {
      const tenant = await createTestTenant(app.module);
      await createTestSubscription(app.module, tenant.id, {
        planKey: 'navigator',
      });
      const stripeSubscriptionId = `sub_test_${randomUUID()}`;
      const created = stripe.subscription(
        stripeSubscriptionId,
        SHIELD_PRICE,
        'active',
        {
          complytude_tenant_id: tenant.id,
        },
      );
      stripe.subscriptions.set(stripeSubscriptionId, created);

      await webhooks.processEvent(
        stripeEvent('customer.subscription.created', created),
      );

      expect(await subscriptionOf(tenant.id)).toMatchObject({
        plan_key: 'shield',
        status: 'active',
        stripe_subscription_id: stripeSubscriptionId,
      });
    });
  });

  describe('re-drive', () => {
    function invoicePaid(stripeSubscriptionId: string): Stripe.Event {
      return stripeEvent('invoice.paid', {
        id: `in_${randomUUID()}`,
        object: 'invoice',
        status: 'paid',
        amount_paid: 5000,
        currency: 'aed',
        parent: {
          subscription_details: { subscription: stripeSubscriptionId },
        },
      });
    }

    it('two workers processing the same event concurrently run its handler once', async () => {
      const { tenantId, stripeSubscriptionId } = await stripeBackedTenant();
      const event = invoicePaid(stripeSubscriptionId);

      await Promise.allSettled([
        webhooks.processEvent(event),
        webhooks.processEvent(event),
      ]);

      const { rows } = await app.databaseService.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.domain_events
         WHERE tenant_id = $1 AND event_type = 'subscription.renewed'`,
        [tenantId],
      );
      expect(Number(rows[0].count)).toBe(1);
      expect(await eventRow(event.id)).toEqual({
        processing_status: 'completed',
        attempts: 1,
      });
    });

    it('counts processing attempts, so an admin retry picks up an event that used all its job attempts', async () => {
      const { stripeSubscriptionId } = await stripeBackedTenant();
      const event = invoicePaid(stripeSubscriptionId);
      stripe.outage = true;
      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(webhooks.processEvent(event)).rejects.toThrow(/outage/);
      }
      expect(await eventRow(event.id)).toEqual({
        processing_status: 'failed',
        attempts: 5,
      });

      stripe.outage = false;
      const result = await app.module
        .get(StripeWebhookMonitoringService)
        .retryFailedEvents();

      expect(result).toMatchObject({ attempted: 1, retried: 1 });
      expect((await eventRow(event.id)).processing_status).toBe('completed');
    });

    const minutes = (n: number, from: Date): Date =>
      new Date(from.getTime() + n * 60_000);

    it('an event failing for 10 minutes is completed by the scheduled re-drive once Stripe recovers', async () => {
      const { tenantId, stripeSubscriptionId } = await stripeBackedTenant();
      const event = invoicePaid(stripeSubscriptionId);
      const monitoring = app.module.get(StripeWebhookMonitoringService);
      const t0 = new Date();
      stripe.outage = true;

      // The queue job's attempts fail within seconds
      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(webhooks.processEvent(event, t0)).rejects.toThrow(
          /outage/,
        );
      }
      // Not due yet: the backoff is respected
      expect(await monitoring.redriveDueEvents(t0)).toMatchObject({
        attempted: 0,
        stillFailing: 1,
      });
      // Re-driven while Stripe is still down: fails again and backs off further
      for (const at of [minutes(2, t0), minutes(5, t0)]) {
        expect(await monitoring.redriveDueEvents(at)).toMatchObject({
          attempted: 1,
          failed: 1,
        });
      }

      stripe.outage = false;
      const recovered = await monitoring.redriveDueEvents(minutes(11, t0));

      expect(recovered).toMatchObject({
        attempted: 1,
        retried: 1,
        stillFailing: 0,
      });
      expect(await eventRow(event.id)).toEqual({
        processing_status: 'completed',
        attempts: 8,
      });
      const { rows } = await app.databaseService.query<{
        current_period_end: Date;
      }>(
        'SELECT current_period_end FROM public.tenant_subscriptions WHERE tenant_id = $1',
        [tenantId],
      );
      expect(rows[0].current_period_end.getTime()).toBe(
        stripe.periodEnd * 1000,
      );
    });

    it('re-drives events stranded by a lost queue job or a crashed worker', async () => {
      const { stripeSubscriptionId } = await stripeBackedTenant();
      const lostJob = invoicePaid(stripeSubscriptionId);
      const crashed = invoicePaid(stripeSubscriptionId);
      const inFlight = invoicePaid(stripeSubscriptionId);
      const repository = app.databaseService;
      for (const event of [lostJob, crashed, inFlight]) {
        await repository.query(
          `INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type, data, processing_status, attempts)
           VALUES ($1, $2, $3, 'pending', 0)`,
          [event.id, event.type, JSON.stringify(event)],
        );
      }
      await repository.query(
        `UPDATE public.stripe_webhook_events SET created_at = now() - interval '11 minutes' WHERE stripe_event_id = $1`,
        [lostJob.id],
      );
      await repository.query(
        `UPDATE public.stripe_webhook_events
         SET processing_status = 'processing', attempts = 1,
             processing_started_at = now() - CASE WHEN stripe_event_id = $1 THEN interval '16 minutes' ELSE interval '1 minute' END
         WHERE stripe_event_id IN ($1, $2)`,
        [crashed.id, inFlight.id],
      );

      const result = await app.module
        .get(StripeWebhookMonitoringService)
        .redriveDueEvents();

      expect(result).toMatchObject({ attempted: 2, retried: 2 });
      expect((await eventRow(lostJob.id)).processing_status).toBe('completed');
      expect((await eventRow(crashed.id)).processing_status).toBe('completed');
      // A recent claim may still be running: it is left alone
      expect((await eventRow(inFlight.id)).processing_status).toBe(
        'processing',
      );
    });

    it('stops re-driving an event after its last attempt, alerts on it, and an admin retry still recovers it', async () => {
      const { stripeSubscriptionId } = await stripeBackedTenant();
      const event = invoicePaid(stripeSubscriptionId);
      const monitoring = app.module.get(StripeWebhookMonitoringService);
      const errors = jest.spyOn(Logger.prototype, 'error');
      stripe.outage = true;
      await expect(webhooks.processEvent(event)).rejects.toThrow(/outage/);
      await app.databaseService.query(
        'UPDATE public.stripe_webhook_events SET attempts = 19 WHERE stripe_event_id = $1',
        [event.id],
      );
      await expect(webhooks.processEvent(event)).rejects.toThrow(/outage/);

      const later = await monitoring.redriveDueEvents(
        minutes(24 * 60, new Date()),
      );

      expect(later).toMatchObject({
        attempted: 0,
        stillFailing: 1,
        exhausted: 1,
      });
      expect(errors).toHaveBeenCalledWith(
        expect.stringMatching(
          /Stripe webhook events failing: failed=1 exhausted=1/,
        ),
      );
      errors.mockRestore();

      stripe.outage = false;
      expect(await monitoring.retryFailedEvents()).toMatchObject({
        attempted: 1,
        retried: 1,
      });
      expect((await eventRow(event.id)).processing_status).toBe('completed');
    });
  });
});

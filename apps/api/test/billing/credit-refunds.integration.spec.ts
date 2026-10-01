import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreditLedgerService } from 'src/modules/entitlements/services/credit-ledger.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { StripeWebhookService } from 'src/modules/stripe/webhook/stripe-webhook.service';
import type Stripe from 'stripe';
import { createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

interface FakeCharge {
  id: string;
  object: 'charge';
  amount: number;
  amount_refunded: number;
  payment_intent: string;
  disputed: boolean;
}

/** The charges and disputes Stripe would report now. */
class FakeStripe {
  readonly charges = new Map<string, FakeCharge>();
  readonly disputes = new Map<string, Stripe.Dispute.Status>();

  readonly client = {
    charges: {
      retrieve: (id: string): Promise<FakeCharge> => {
        const charge = this.charges.get(id);
        if (!charge) throw new Error(`No such charge: ${id}`);
        return Promise.resolve({ ...charge });
      },
    },
    disputes: {
      list: (params: {
        charge: string;
      }): Promise<{ data: { status: Stripe.Dispute.Status }[] }> => {
        const status = this.disputes.get(params.charge);
        return Promise.resolve({ data: status ? [{ status }] : [] });
      },
    },
  };
}

function stripeEvent(type: string, object: object): Stripe.Event {
  return {
    id: `evt_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    type,
    api_version: '2026-02-25.clover',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  } as unknown as Stripe.Event;
}

/**
 * Credits follow the money: a refunded or disputed credit purchase loses its credits (even below
 * zero, which blocks spending), and a won dispute gives them back.
 */
describe('Credit purchases refunded or disputed in Stripe', () => {
  let app: TestApp;
  let stripe: FakeStripe;
  let webhooks: StripeWebhookService;
  let credits: CreditLedgerService;

  beforeAll(async () => {
    stripe = new FakeStripe();
    app = await createTestApp({
      providers: [
        { provide: StripeService, useValue: { client: stripe.client } },
      ],
    });
    webhooks = app.module.get(StripeWebhookService);
    credits = app.module.get(CreditLedgerService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    stripe.charges.clear();
    stripe.disputes.clear();
  }, 15000);

  afterEach(async () => {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** A tenant that bought 100 credits for AED 200 with charge `ch`. */
  async function purchased(): Promise<{
    tenantId: string;
    charge: FakeCharge;
  }> {
    const tenant = await createTestTenant(app.module);
    const paymentIntent = `pi_${randomUUID()}`;
    await credits.purchase({
      tenantId: tenant.id,
      amount: 100,
      idempotencyKey: `checkout:cs_${randomUUID()}`,
      stripePaymentIntentId: paymentIntent,
    });
    const charge: FakeCharge = {
      id: `ch_${randomUUID()}`,
      object: 'charge',
      amount: 20000,
      amount_refunded: 0,
      payment_intent: paymentIntent,
      disputed: false,
    };
    stripe.charges.set(charge.id, charge);
    return { tenantId: tenant.id, charge };
  }

  const balance = (tenantId: string): Promise<number> =>
    credits.getBalance(tenantId, { tenant: { tenantId, schema: 'public' } });

  async function reversals(tenantId: string): Promise<number[]> {
    const { rows } = await app.databaseService.query<{ amount: number }>(
      `SELECT amount FROM public.credit_ledger
       WHERE tenant_id = $1 AND transaction_type = 'reversal' ORDER BY recorded_at`,
      [tenantId],
    );
    return rows.map((row) => row.amount);
  }

  it('a full refund takes every credit back, below zero if spent, and spending stops', async () => {
    const { tenantId, charge } = await purchased();
    await credits.deduct({ tenantId, amount: 70 });
    charge.amount_refunded = 20000;

    await webhooks.processEvent(stripeEvent('charge.refunded', { ...charge }));

    expect(await reversals(tenantId)).toEqual([-100]);
    expect(await balance(tenantId)).toBe(-70);
    await expect(
      credits.deduct({ tenantId, amount: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // A late or repeated event changes nothing
    await webhooks.processEvent(stripeEvent('charge.refunded', { ...charge }));
    expect(await reversals(tenantId)).toEqual([-100]);
  });

  it('a partial refund takes back its share, rounded up; the rest follows a later refund', async () => {
    const { tenantId, charge } = await purchased();
    charge.amount_refunded = 5001;

    await webhooks.processEvent(stripeEvent('charge.refunded', { ...charge }));
    expect(await reversals(tenantId)).toEqual([-26]);
    expect(await balance(tenantId)).toBe(74);

    charge.amount_refunded = 20000;
    await webhooks.processEvent(stripeEvent('charge.refunded', { ...charge }));
    expect(await reversals(tenantId)).toEqual([-26, -74]);
    expect(await balance(tenantId)).toBe(0);
  });

  it('a dispute takes the credits back while open, and a won dispute returns them', async () => {
    const { tenantId, charge } = await purchased();
    charge.disputed = true;
    stripe.disputes.set(charge.id, 'needs_response');
    const dispute = (status: string): object => ({
      id: `dp_${charge.id}`,
      object: 'dispute',
      charge: charge.id,
      status,
    });

    await webhooks.processEvent(
      stripeEvent('charge.dispute.created', dispute('needs_response')),
    );
    expect(await balance(tenantId)).toBe(0);

    stripe.disputes.set(charge.id, 'won');
    await webhooks.processEvent(
      stripeEvent('charge.dispute.closed', dispute('won')),
    );

    expect(await reversals(tenantId)).toEqual([-100, 100]);
    expect(await balance(tenantId)).toBe(100);
  });

  it('a refund of a payment that bought no credits is left alone', async () => {
    const tenant = await createTestTenant(app.module);
    await credits.grant({ tenantId: tenant.id, amount: 10, reason: 'test' });
    const charge: FakeCharge = {
      id: `ch_${randomUUID()}`,
      object: 'charge',
      amount: 20000,
      amount_refunded: 20000,
      payment_intent: `pi_${randomUUID()}`,
      disputed: false,
    };
    stripe.charges.set(charge.id, charge);
    const event = stripeEvent('charge.refunded', { ...charge });

    await webhooks.processEvent(event);

    expect(await reversals(tenant.id)).toEqual([]);
    expect(await balance(tenant.id)).toBe(10);
    const { rows } = await app.databaseService.query<{
      processing_status: string;
    }>(
      'SELECT processing_status FROM public.stripe_webhook_events WHERE stripe_event_id = $1',
      [event.id],
    );
    expect(rows[0].processing_status).toBe('completed');
  });
});

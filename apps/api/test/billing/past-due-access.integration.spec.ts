import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DunningEmailHandler } from 'src/modules/billing/handlers/dunning-email.handler';
import { EmailService } from 'src/modules/email/email.service';
import { CreditLedgerService } from 'src/modules/entitlements/services/credit-ledger.service';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { EntitlementResolverService } from 'src/modules/entitlements/services/entitlement-resolver.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { StripeWebhookService } from 'src/modules/stripe/webhook/stripe-webhook.service';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stripe's current subscription and invoice state, as the handlers re-fetch it. */
class FakeStripe {
  readonly subscriptions = new Map<string, object>();
  readonly invoices = new Map<string, { id: string; status: string }>();
  readonly periodEnd = Math.floor(Date.now() / 1000) + 25 * 86400;

  setSubscription(id: string, status: Stripe.Subscription.Status): void {
    this.subscriptions.set(id, {
      id,
      object: 'subscription',
      status,
      customer: `cus_${id}`,
      metadata: {},
      items: {
        data: [
          {
            id: `si_${id}`,
            price: { id: 'price_unused', recurring: { interval: 'month' } },
            quantity: 1,
            current_period_start: this.periodEnd - 30 * 86400,
            current_period_end: this.periodEnd,
          },
        ],
      },
    });
  }

  readonly client = {
    subscriptions: {
      retrieve: (id: string): Promise<object> =>
        Promise.resolve(this.subscriptions.get(id)!),
    },
    invoices: {
      retrieve: (id: string): Promise<{ id: string; status: string }> =>
        Promise.resolve(this.invoices.get(id)!),
    },
  };
}

function event(type: string, object: object): Stripe.Event {
  return {
    id: `evt_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  } as unknown as Stripe.Event;
}

/**
 * Past-due policy: 7 days of full access after the first failed payment, then read-only until
 * paid; dunning emails once per invoice and step, skipped once the invoice is paid.
 */
describe('Past-due access and dunning (app role)', () => {
  let app: TestApp;
  let stripe: FakeStripe;
  let webhooks: StripeWebhookService;
  let resolver: EntitlementResolverService;
  let enforcement: EntitlementEnforcementService;
  let sendDunningEmail: jest.SpyInstance;

  beforeAll(async () => {
    stripe = new FakeStripe();
    app = await createTestApp({
      providers: [
        { provide: StripeService, useValue: { client: stripe.client } },
      ],
    });
    webhooks = app.module.get(StripeWebhookService);
    resolver = app.module.get(EntitlementResolverService);
    enforcement = app.module.get(EntitlementEnforcementService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    stripe.subscriptions.clear();
    stripe.invoices.clear();
    sendDunningEmail = jest
      .spyOn(EmailService.prototype, 'sendDunningEmail')
      .mockResolvedValue(undefined as never);
  }, 15000);

  afterEach(async () => {
    // Let the immediate (day-0) dunning job finish before the next test or shutdown
    const queue = app.module.get<Queue>(
      getQueueToken(QUEUE_NAMES.BILLING_PROCESSING),
    );
    for (
      let i = 0;
      i < 100 &&
      (await queue.getActiveCount()) + (await queue.getWaitingCount()) > 0;
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    sendDunningEmail.mockRestore();
  }, 20000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** A Shield tenant paying through Stripe, with an admin (the dunning recipient). */
  async function payingTenant(): Promise<{
    tenantId: string;
    stripeSubscriptionId: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const stripeSubscriptionId = `sub_${randomUUID()}`;
    await app.databaseService.query(
      'UPDATE public.tenant_subscriptions SET stripe_subscription_id = $2 WHERE tenant_id = $1',
      [tenant.id, stripeSubscriptionId],
    );
    stripe.setSubscription(stripeSubscriptionId, 'active');
    return { tenantId: tenant.id, stripeSubscriptionId };
  }

  /** Stripe fails the renewal: the subscription goes past due and the invoice stays open. */
  async function paymentFails(
    stripeSubscriptionId: string,
    invoiceId: string,
  ): Promise<void> {
    stripe.setSubscription(stripeSubscriptionId, 'past_due');
    stripe.invoices.set(invoiceId, { id: invoiceId, status: 'open' });
    await webhooks.processEvent(
      event('invoice.payment_failed', {
        id: invoiceId,
        object: 'invoice',
        status: 'open',
        amount_due: 5000,
        attempt_count: 1,
        next_payment_attempt: null,
        hosted_invoice_url: `https://invoice.stripe.test/${invoiceId}`,
        currency: 'aed',
        parent: {
          subscription_details: { subscription: stripeSubscriptionId },
        },
      }),
    );
  }

  async function pastDueSince(tenantId: string): Promise<string | undefined> {
    const { rows } = await app.databaseService.query<{ since: string | null }>(
      `SELECT metadata->>'past_due_since' AS since FROM public.tenant_subscriptions WHERE tenant_id = $1`,
      [tenantId],
    );
    return rows[0].since ?? undefined;
  }

  async function setPastDueSince(tenantId: string, since: Date): Promise<void> {
    await app.databaseService.query(
      `UPDATE public.tenant_subscriptions
       SET metadata = metadata || jsonb_build_object('past_due_since', $2::text) WHERE tenant_id = $1`,
      [tenantId, since.toISOString()],
    );
    await app.databaseService.query(
      'UPDATE public.entitlement_snapshots SET invalidated_at = now() WHERE tenant_id = $1 AND invalidated_at IS NULL',
      [tenantId],
    );
  }

  const documents = async (tenantId: string): Promise<number | undefined> =>
    (await resolver.resolveForTenant(tenantId, 'documents_per_month'))
      ?.value_int;

  it('a failed payment keeps full access during the grace period', async () => {
    const { tenantId, stripeSubscriptionId } = await payingTenant();
    const paidAllowance = await documents(tenantId);

    await paymentFails(stripeSubscriptionId, `in_${randomUUID()}`);

    expect(await pastDueSince(tenantId)).toBeDefined();
    expect(await documents(tenantId)).toBe(paidAllowance);
    const result = await enforcement.checkAndRecord({
      tenantId,
      featureKey: 'documents_per_month',
    });
    expect(result.allowed).toBe(true);
  });

  it('after the grace period the tenant is read-only, and credits do not help', async () => {
    const { tenantId, stripeSubscriptionId } = await payingTenant();
    const library = (
      await resolver.resolveForTenant(tenantId, 'template_library')
    )?.value_text;
    await paymentFails(stripeSubscriptionId, `in_${randomUUID()}`);
    await setPastDueSince(tenantId, new Date(Date.now() - 8 * DAY_MS));
    await app.module
      .get(CreditLedgerService)
      .grant({ tenantId, amount: 100, reason: 'test' });

    const result = await enforcement.checkAndRecord({
      tenantId,
      featureKey: 'documents_per_month',
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: 'payment_required',
    });
    expect(await documents(tenantId)).toBe(0);
    // What the tenant can read is unchanged
    expect(
      (await resolver.resolveForTenant(tenantId, 'template_library'))
        ?.value_text,
    ).toBe(library);
  });

  it("Stripe's payment retries don't restart the grace period", async () => {
    const { tenantId, stripeSubscriptionId } = await payingTenant();
    const invoiceId = `in_${randomUUID()}`;
    await paymentFails(stripeSubscriptionId, invoiceId);
    const since = await pastDueSince(tenantId);

    await paymentFails(stripeSubscriptionId, invoiceId);

    expect(await pastDueSince(tenantId)).toBe(since);
  });

  it('the grace period ends on time even with entitlements cached', async () => {
    const { tenantId, stripeSubscriptionId } = await payingTenant();
    await paymentFails(stripeSubscriptionId, `in_${randomUUID()}`);
    await setPastDueSince(tenantId, new Date(Date.now() - 7 * DAY_MS + 2000));
    expect(await documents(tenantId)).toBeGreaterThan(0); // cached, still in grace

    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(await documents(tenantId)).toBe(0);
  });

  it('a successful retry restores full access and stops the remaining emails', async () => {
    const { tenantId, stripeSubscriptionId } = await payingTenant();
    const paidAllowance = await documents(tenantId);
    const invoiceId = `in_${randomUUID()}`;
    await paymentFails(stripeSubscriptionId, invoiceId);
    await setPastDueSince(tenantId, new Date(Date.now() - 8 * DAY_MS));
    expect(await documents(tenantId)).toBe(0);

    stripe.setSubscription(stripeSubscriptionId, 'active');
    stripe.invoices.set(invoiceId, { id: invoiceId, status: 'paid' });
    await webhooks.processEvent(
      event('invoice.paid', {
        id: invoiceId,
        object: 'invoice',
        status: 'paid',
        amount_paid: 5000,
        currency: 'aed',
        parent: {
          subscription_details: { subscription: stripeSubscriptionId },
        },
      }),
    );

    expect(await pastDueSince(tenantId)).toBeUndefined();
    expect(await documents(tenantId)).toBe(paidAllowance);

    sendDunningEmail.mockClear();
    await app.module.get(DunningEmailHandler).execute({
      data: {
        tenantId,
        tenantAdminEmail: 'admin@example.com',
        stripeSubscriptionId,
        invoiceId,
        hostedInvoiceUrl: 'https://invoice.stripe.test',
        attemptCount: 1,
        dunningSequence: 'day3',
        amount: 5000,
        currency: 'aed',
        dueDate: new Date().toISOString(),
      },
    } as never);
    expect(sendDunningEmail).not.toHaveBeenCalled();
  });

  it('queues each dunning email once per invoice, however often the payment fails', async () => {
    const { stripeSubscriptionId } = await payingTenant();
    const invoiceId = `in_${randomUUID()}`;

    await paymentFails(stripeSubscriptionId, invoiceId);
    await paymentFails(stripeSubscriptionId, invoiceId);
    await paymentFails(stripeSubscriptionId, invoiceId);

    const queue = app.module.get<Queue>(
      getQueueToken(QUEUE_NAMES.BILLING_PROCESSING),
    );
    const jobs = await queue.getJobs([
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    ]);
    const dunning = jobs
      .filter((job) => job.name === 'dunning-email')
      .map((job) => job.id)
      .sort();
    expect(dunning).toEqual([
      `dunning-${invoiceId}-day0`,
      `dunning-${invoiceId}-day3`,
      `dunning-${invoiceId}-day5`,
    ]);
  });
});

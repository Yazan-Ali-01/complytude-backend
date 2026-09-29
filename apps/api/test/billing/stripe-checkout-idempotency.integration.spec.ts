import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { StripeCustomerService } from 'src/modules/stripe/services/stripe-customer.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { StripeWebhookService } from 'src/modules/stripe/webhook/stripe-webhook.service';
import { StripeCustomerCreationHandler } from 'src/modules/tenant-processing/handlers/stripe-customer-creation.handler';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const SHIELD_PRICE = 'price_test_idem_shield';
const INFRASTRUCTURE_PRICE = 'price_test_idem_infrastructure';
const ADDON_PRICE = 'price_test_idem_addon';

interface FakeSession {
  id: string;
  object: 'checkout.session';
  url: string;
  status: 'open' | 'complete' | 'expired';
  mode: string;
  customer: string;
  metadata: Record<string, string>;
}

type Replayable<T> = T & { lastResponse: { headers: Record<string, string> } };

interface FakePortalConfiguration {
  id: string;
  active: boolean;
  metadata: Record<string, string>;
  params: {
    metadata: Record<string, string>;
    features: {
      subscription_update: {
        enabled: boolean;
        products: { product: string; prices: string[] }[];
      };
      subscription_cancel: { mode: string };
    };
  };
}

/**
 * An in-memory Stripe that honours idempotency keys like Stripe does: the first request with a
 * key creates the object; a later one with the same key and parameters replays the original
 * response (flagged `idempotent-replayed`), and one with different parameters is rejected.
 */
class FakeStripe {
  readonly customers: {
    id: string;
    email?: string;
    metadata: Record<string, string>;
  }[] = [];
  readonly sessions = new Map<string, FakeSession>();
  readonly items: { id: string; subscription: string; price: string }[] = [];
  readonly liveSubscriptions = new Map<
    string,
    { id: string; status: string }[]
  >();
  readonly subscriptions = new Map<string, object>();
  readonly portalConfigurations: FakePortalConfiguration[] = [];
  readonly portalSessions: {
    customer: string;
    return_url: string;
    configuration?: string;
  }[] = [];
  private readonly keys = new Map<
    string,
    { params: string; response: string }
  >();

  private keyed<T extends object>(
    key: string | undefined,
    params: object,
    create: () => T,
  ): Promise<Replayable<T>> {
    const fresh = (response: T, replayed: boolean): Replayable<T> => ({
      ...(JSON.parse(JSON.stringify(response)) as T),
      lastResponse: {
        headers: replayed ? { 'idempotent-replayed': 'true' } : {},
      },
    });
    if (!key) return Promise.resolve(fresh(create(), false));
    const serialized = JSON.stringify(params);
    const cached = this.keys.get(key);
    if (cached) {
      if (cached.params !== serialized) {
        return Promise.reject(
          new Error(`Idempotency key ${key} reused with different parameters`),
        );
      }
      return Promise.resolve(fresh(JSON.parse(cached.response) as T, true));
    }
    const response = create();
    this.keys.set(key, {
      params: serialized,
      response: JSON.stringify(response),
    });
    return Promise.resolve(fresh(response, false));
  }

  readonly client = {
    customers: {
      create: (
        params: { email?: string; metadata: Record<string, string> },
        options?: { idempotencyKey?: string },
      ) =>
        this.keyed(options?.idempotencyKey, params, () => {
          const customer = {
            id: `cus_${randomUUID()}`,
            email: params.email,
            metadata: params.metadata,
          };
          this.customers.push(customer);
          return customer;
        }),
    },
    subscriptions: {
      list: (params: { customer: string }) =>
        Promise.resolve({
          data: this.liveSubscriptions.get(params.customer) ?? [],
        }),
      retrieve: (id: string) => {
        const subscription = this.subscriptions.get(id);
        return subscription
          ? Promise.resolve(subscription)
          : Promise.reject(new Error(`No such subscription: ${id}`));
      },
    },
    checkout: {
      sessions: {
        create: (
          params: {
            mode: string;
            customer: string;
            metadata: Record<string, string>;
          },
          options?: { idempotencyKey?: string },
        ) =>
          this.keyed(options?.idempotencyKey, params, () => {
            const id = `cs_${randomUUID()}`;
            const session: FakeSession = {
              id,
              object: 'checkout.session',
              url: `https://checkout.stripe.test/${id}`,
              status: 'open',
              mode: params.mode,
              customer: params.customer,
              metadata: params.metadata,
            };
            this.sessions.set(id, session);
            return session;
          }),
        retrieve: (id: string) =>
          Promise.resolve({ ...this.sessions.get(id)! }),
        list: (params: { customer: string; status: string }) =>
          Promise.resolve({
            data: [...this.sessions.values()].filter(
              (session) =>
                session.customer === params.customer &&
                session.status === params.status,
            ),
          }),
        expire: (id: string) => {
          const session = this.sessions.get(id)!;
          session.status = 'expired';
          return Promise.resolve({ ...session });
        },
      },
    },
    billingPortal: {
      configurations: {
        list: () =>
          Promise.resolve({
            data: this.portalConfigurations.filter((c) => c.active),
          }),
        create: (params: FakePortalConfiguration['params']) => {
          const configuration = {
            id: `bpc_${randomUUID()}`,
            active: true,
            metadata: params.metadata,
            params,
          };
          this.portalConfigurations.push(configuration);
          return Promise.resolve(configuration);
        },
        update: (id: string, params: FakePortalConfiguration['params']) => {
          const configuration = this.portalConfigurations.find(
            (c) => c.id === id,
          )!;
          configuration.params = params;
          return Promise.resolve(configuration);
        },
      },
      sessions: {
        create: (params: {
          customer: string;
          return_url: string;
          configuration?: string;
        }) => {
          this.portalSessions.push(params);
          return Promise.resolve({
            url: `https://billing.stripe.test/p/${randomUUID()}`,
          });
        },
      },
    },
    subscriptionItems: {
      create: (
        params: { subscription: string; price: string },
        options?: { idempotencyKey?: string },
      ) =>
        this.keyed(options?.idempotencyKey, params, () => {
          const item = {
            id: `si_${randomUUID()}`,
            subscription: params.subscription,
            price: params.price,
          };
          this.items.push(item);
          return item;
        }),
    },
  };

  reset(): void {
    this.portalConfigurations.length = 0;
    this.portalSessions.length = 0;
    this.customers.length = 0;
    this.items.length = 0;
    this.sessions.clear();
    this.liveSubscriptions.clear();
    this.subscriptions.clear();
    this.keys.clear();
  }
}

/**
 * Duplicate Stripe customers and subscriptions: double clicks, job retries, a second checkout,
 * and a stale subscription's deletion. Runs as the app's database role.
 */
describe('Stripe checkout and customer idempotency', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let stripe: FakeStripe;
  let savedPrices: { key: string; monthly: string | null }[];

  beforeAll(async () => {
    stripe = new FakeStripe();
    app = await createTestApp({
      providers: [
        { provide: StripeService, useValue: { client: stripe.client } },
      ],
    });
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;

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
    stripe.reset();
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

  /** A tenant on the free plan with an admin, not yet a Stripe customer. */
  async function freeTenant(): Promise<{
    tenantId: string;
    adminEmail: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'navigator',
    });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    return { tenantId: tenant.id, adminEmail: user.email };
  }

  async function tenantAdminCookie(
    email: string,
    tenantId: string,
  ): Promise<string> {
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Test123!@#' },
    });
    expect(login.statusCode).toBe(200);
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: {
        cookie: cookieHeaderFromSetCookie(
          login.headers as Record<string, string | string[] | undefined>,
        ),
      },
      payload: { tenantId },
    });
    expect(switched.statusCode).toBe(200);
    return cookieHeaderFromSetCookie(
      switched.headers as Record<string, string | string[] | undefined>,
    );
  }

  function checkout(cookie: string, planKey: string): Promise<InjectResponse> {
    return server.inject({
      method: 'POST',
      url: '/api/v1/billing/checkout/subscription',
      headers: { cookie },
      payload: {
        planKey,
        interval: 'monthly',
        // FRONTEND_URL in .env.test: Stripe may only send customers back to the web app
        successUrl: 'http://localhost:3001/billing/success',
        cancelUrl: 'http://localhost:3001/billing',
      },
    });
  }

  async function storedCustomerId(tenantId: string): Promise<string | null> {
    const { rows } = await app.databaseService.query<{
      stripe_customer_id: string | null;
    }>('SELECT stripe_customer_id FROM public.tenants WHERE id = $1', [
      tenantId,
    ]);
    return rows[0].stripe_customer_id;
  }

  describe('redirects and the billing portal', () => {
    it('refuses a checkout that would send the customer to another site, before anything reaches Stripe', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      const cookie = await tenantAdminCookie(adminEmail, tenantId);

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/billing/checkout/subscription',
        headers: { cookie },
        payload: {
          planKey: 'shield',
          interval: 'monthly',
          successUrl: 'https://evil.example.net/phish',
          cancelUrl: 'http://localhost:3001/billing',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(stripe.sessions.size).toBe(0);
    });

    it('opens the portal on the managed configuration (catalog prices only), and never to another site', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      const cookie = await tenantAdminCookie(adminEmail, tenantId);
      const portal = (returnUrl: string) =>
        server.inject({
          method: 'POST',
          url: '/api/v1/billing/portal/session',
          headers: { cookie },
          payload: { returnUrl },
        });

      expect((await portal('https://evil.example.net/')).statusCode).toBe(400);
      expect(stripe.portalSessions).toHaveLength(0);

      const opened = await portal('http://localhost:3001/billing');
      expect(opened.statusCode).toBe(201);
      expect(stripe.portalConfigurations).toHaveLength(1);
      const [configuration] = stripe.portalConfigurations;
      expect(stripe.portalSessions[0].configuration).toBe(configuration.id);
      expect(configuration.metadata).toEqual({ managed_by: 'complytude' });
      expect(configuration.params.features.subscription_cancel.mode).toBe(
        'at_period_end',
      );
      const { rows } = await app.databaseService.query<{ price: string }>(
        `SELECT unnest(ARRAY[stripe_price_id_monthly, stripe_price_id_annual]) AS price
         FROM public.plans WHERE is_active AND stripe_product_id IS NOT NULL`,
      );
      const catalog = new Set(rows.map((r) => r.price).filter(Boolean));
      const offered =
        configuration.params.features.subscription_update.products.flatMap(
          (product) => product.prices,
        );
      expect(offered.every((price) => catalog.has(price))).toBe(true);

      // A second session reuses it rather than creating another
      await portal('http://localhost:3001/billing');
      expect(stripe.portalConfigurations).toHaveLength(1);
    });
  });

  describe('customers', () => {
    it('a double-clicked checkout creates one Stripe customer and one session', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      const cookie = await tenantAdminCookie(adminEmail, tenantId);

      const [first, second] = await Promise.all([
        checkout(cookie, 'shield'),
        checkout(cookie, 'shield'),
      ]);

      expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
      expect(second.json<{ sessionId: string }>().sessionId).toBe(
        first.json<{ sessionId: string }>().sessionId,
      );
      expect(stripe.customers).toHaveLength(1);
      expect(stripe.sessions.size).toBe(1);
      expect(await storedCustomerId(tenantId)).toBe(stripe.customers[0].id);
    });

    it('checkout racing the customer-creation job creates one customer', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      const tenant = await app.module.get(TenantRepository).findById(tenantId, {
        tenant: { tenantId, schema: 'public' },
      });

      await Promise.all([
        app.module.get(StripeCustomerCreationHandler).execute({
          data: { tenantId, email: adminEmail, userId: randomUUID() },
          attemptsMade: 0,
        } as never),
        app.module.get(StripeCustomerService).getOrCreateCustomer(tenant!.id),
      ]);

      expect(stripe.customers).toHaveLength(1);
      expect(await storedCustomerId(tenantId)).toBe(stripe.customers[0].id);
    });

    it('a job retried after the DB write failed reuses the customer Stripe created', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      const customers = app.module.get(StripeCustomerService);
      const tenant = { id: tenantId } as Parameters<
        StripeCustomerService['createCustomerForTenant']
      >[0];
      // Several modules provide their own TenantRepository, so spy on the class
      const write = jest
        .spyOn(TenantRepository.prototype, 'setStripeCustomerIdIfMissing')
        .mockRejectedValueOnce(new Error('connection lost'));

      await expect(
        customers.createCustomerForTenant(tenant, adminEmail),
      ).rejects.toThrow('connection lost');
      const customerId = await customers.createCustomerForTenant(
        tenant,
        adminEmail,
      );
      write.mockRestore();

      expect(stripe.customers).toHaveLength(1);
      expect(customerId).toBe(stripe.customers[0].id);
      expect(await storedCustomerId(tenantId)).toBe(customerId);
    });
  });

  describe('subscriptions', () => {
    it('refuses checkout while the tenant has a past-due Stripe subscription', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      await app.databaseService.query(
        `UPDATE public.tenant_subscriptions SET status = 'past_due', stripe_subscription_id = $2 WHERE tenant_id = $1`,
        [tenantId, `sub_${randomUUID()}`],
      );
      const cookie = await tenantAdminCookie(adminEmail, tenantId);

      const response = await checkout(cookie, 'shield');

      expect(response.statusCode).toBe(409);
      expect(stripe.sessions.size).toBe(0);
    });

    it('refuses checkout when Stripe has a live subscription the webhook has not recorded yet', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      const customerId = await app.module
        .get(StripeCustomerService)
        .getOrCreateCustomer(tenantId);
      stripe.liveSubscriptions.set(customerId!, [
        { id: `sub_${randomUUID()}`, status: 'active' },
      ]);
      const cookie = await tenantAdminCookie(adminEmail, tenantId);

      const response = await checkout(cookie, 'shield');

      expect(response.statusCode).toBe(409);
      expect(stripe.sessions.size).toBe(0);
    });

    it("a checkout for another plan expires the first one's session, and returning to it opens a new one", async () => {
      const { tenantId, adminEmail } = await freeTenant();
      const cookie = await tenantAdminCookie(adminEmail, tenantId);

      const shield = (await checkout(cookie, 'shield')).json<{
        sessionId: string;
      }>().sessionId;
      const infrastructure = (await checkout(cookie, 'infrastructure')).json<{
        sessionId: string;
      }>().sessionId;
      const shieldAgain = (await checkout(cookie, 'shield')).json<{
        sessionId: string;
      }>().sessionId;

      expect(stripe.sessions.get(shield)?.status).toBe('expired');
      expect(stripe.sessions.get(infrastructure)?.status).toBe('expired');
      expect(shieldAgain).not.toBe(shield);
      expect(stripe.sessions.get(shieldAgain)?.status).toBe('open');
      expect(
        [...stripe.sessions.values()].filter((s) => s.status === 'open'),
      ).toHaveLength(1);
    });

    it('deleting a stale subscription keeps the paying one and its add-ons', async () => {
      const { tenantId } = await freeTenant();
      const staleSub = `sub_stale_${randomUUID()}`;
      const payingSub = `sub_paying_${randomUUID()}`;
      const db = app.databaseService;
      // The old subscription went past due; a second checkout started a paying one
      await db.query(
        `UPDATE public.tenant_subscriptions SET status = 'past_due', stripe_subscription_id = $2 WHERE tenant_id = $1`,
        [tenantId, staleSub],
      );
      await db.query(
        `INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, billing_period_start, billing_period_end,
           current_period_start, current_period_end, stripe_subscription_id)
         VALUES ($1, (SELECT id FROM public.plans WHERE key = 'shield'), 'active', now(), now() + interval '1 month',
           now(), now() + interval '1 month', $2)`,
        [tenantId, payingSub],
      );
      const addon = async (priceId: string): Promise<string> =>
        (
          await db.query<{ id: string }>(
            `INSERT INTO public.addons (key, name, stripe_price_id) VALUES ($1, 'Idempotency add-on', $2) RETURNING id`,
            [`idem-${randomUUID()}`, priceId],
          )
        ).rows[0].id;
      await db.query(
        `INSERT INTO public.tenant_addons (tenant_id, addon_id, status, stripe_subscription_item_id)
         VALUES ($1, $2, 'active', 'si_stale'), ($1, $3, 'active', 'si_paying')`,
        [
          tenantId,
          await addon(`price_stale_${randomUUID()}`),
          await addon(`price_paying_${randomUUID()}`),
        ],
      );
      stripe.subscriptions.set(staleSub, {
        id: staleSub,
        object: 'subscription',
        status: 'canceled',
        customer: 'cus_test',
        metadata: {},
        items: { data: [{ id: 'si_stale', price: { id: SHIELD_PRICE } }] },
      });

      await app.module.get(StripeWebhookService).processEvent({
        id: `evt_${randomUUID().replace(/-/g, '')}`,
        object: 'event',
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: staleSub, object: 'subscription' } },
      } as unknown as Stripe.Event);

      const { rows: subscriptions } = await db.query<{
        plan: string;
        status: string;
        stripe_subscription_id: string;
      }>(
        `SELECT p.key AS plan, s.status, s.stripe_subscription_id FROM public.tenant_subscriptions s
         JOIN public.plans p ON p.id = s.plan_id WHERE s.tenant_id = $1 ORDER BY s.stripe_subscription_id`,
        [tenantId],
      );
      expect(subscriptions).toEqual(
        expect.arrayContaining([
          {
            plan: 'navigator',
            status: 'cancelled',
            stripe_subscription_id: staleSub,
          },
          {
            plan: 'shield',
            status: 'active',
            stripe_subscription_id: payingSub,
          },
        ]),
      );
      expect(subscriptions).toHaveLength(2);
      const { rows: addons } = await db.query<{ item: string; status: string }>(
        `SELECT stripe_subscription_item_id AS item, status FROM public.tenant_addons WHERE tenant_id = $1 ORDER BY 1`,
        [tenantId],
      );
      expect(addons).toEqual([
        { item: 'si_paying', status: 'active' },
        { item: 'si_stale', status: 'cancelled' },
      ]);
    });

    it('a double-clicked add-on purchase creates one Stripe item and one add-on', async () => {
      const { tenantId, adminEmail } = await freeTenant();
      await app.databaseService.query(
        `UPDATE public.tenant_subscriptions SET plan_id = (SELECT id FROM public.plans WHERE key = 'shield'),
           stripe_subscription_id = $2 WHERE tenant_id = $1`,
        [tenantId, `sub_${randomUUID()}`],
      );
      const addonKey = `idem-addon-${randomUUID()}`;
      await app.databaseService.query(
        `INSERT INTO public.addons (key, name, stripe_price_id) VALUES ($1, 'Idempotency add-on', $2)`,
        [addonKey, ADDON_PRICE],
      );
      const cookie = await tenantAdminCookie(adminEmail, tenantId);
      const purchase = (): Promise<InjectResponse> =>
        server.inject({
          method: 'POST',
          url: '/api/v1/tenants/addons',
          headers: { cookie },
          payload: { addonKey },
        });

      const responses = await Promise.all([purchase(), purchase()]);
      // Adding an add-on queues entitlement work; let it finish before the app shuts down
      await waitForQueueIdle(
        app.module.get<Queue>(
          getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING),
        ),
        15000,
      );

      // The second click either converges on the same add-on or is told it's already active
      expect(responses.map((r) => r.statusCode).sort()).toEqual(
        expect.arrayContaining([201]),
      );
      for (const response of responses) {
        expect([201, 400]).toContain(response.statusCode);
      }
      expect(stripe.items).toHaveLength(1);
      const { rows } = await app.databaseService.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.tenant_addons WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      );
      expect(Number(rows[0].count)).toBe(1);
    });
  });
});

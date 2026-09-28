import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { StripeReconciliationService } from 'src/modules/stripe/services/stripe-reconciliation.service';
import { StripeService } from 'src/modules/stripe/stripe.service';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const SHIELD_PRICE = 'price_test_shield_monthly';
const INFRASTRUCTURE_PRICE = 'price_test_infrastructure_monthly';
const ADDON_PRICE = 'price_test_addon_monthly';

interface FakeItem {
  id: string;
  price: { id: string; recurring: { interval: 'month' } };
  quantity: number;
  current_period_start: number;
  current_period_end: number;
}

interface FakeSubscription {
  id: string;
  status: Stripe.Subscription.Status;
  cancel_at_period_end: boolean;
  items: { data: FakeItem[] };
}

interface FakeSchedule {
  id: string;
  status: 'active' | 'released';
  phases: { items: { price: string }[]; start_date: number }[];
}

/** An in-memory stand-in for the Stripe client calls the subscription services make. */
class FakeStripe {
  readonly subscriptions = new Map<string, FakeSubscription>();
  readonly schedules = new Map<string, FakeSchedule>();
  readonly periodStart = Math.floor(Date.now() / 1000) - 5 * 86400;
  readonly periodEnd = Math.floor(Date.now() / 1000) + 25 * 86400;

  addSubscription(id: string, extraItems: FakeItem[] = []): void {
    this.subscriptions.set(id, {
      id,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [this.item(`si_plan_${id}`, SHIELD_PRICE, 1), ...extraItems],
      },
    });
  }

  item(id: string, priceId: string, quantity: number): FakeItem {
    return {
      id,
      price: { id: priceId, recurring: { interval: 'month' } },
      quantity,
      current_period_start: this.periodStart,
      current_period_end: this.periodEnd,
    };
  }

  private subscription(id: string): FakeSubscription {
    const subscription = this.subscriptions.get(id);
    if (!subscription) throw new Error(`No such subscription: ${id}`);
    return subscription;
  }

  readonly client = {
    subscriptions: {
      retrieve: (id: string): Promise<FakeSubscription> =>
        Promise.resolve(this.subscription(id)),
      update: (
        id: string,
        params: { cancel_at_period_end?: boolean },
      ): Promise<FakeSubscription> => {
        const subscription = this.subscription(id);
        if (params.cancel_at_period_end !== undefined) {
          subscription.cancel_at_period_end = params.cancel_at_period_end;
        }
        return Promise.resolve(subscription);
      },
    },
    subscriptionSchedules: {
      create: (params: {
        from_subscription: string;
      }): Promise<FakeSchedule> => {
        this.subscription(params.from_subscription);
        const schedule: FakeSchedule = {
          id: `sub_sched_${randomUUID()}`,
          status: 'active',
          phases: [],
        };
        this.schedules.set(schedule.id, schedule);
        return Promise.resolve(schedule);
      },
      update: (
        id: string,
        params: {
          phases: { items: { price: string }[]; start_date: number }[];
        },
      ): Promise<FakeSchedule> => {
        const schedule = this.schedules.get(id)!;
        schedule.phases = params.phases;
        return Promise.resolve(schedule);
      },
      retrieve: (id: string): Promise<FakeSchedule> =>
        Promise.resolve(this.schedules.get(id)!),
      release: (id: string): Promise<FakeSchedule> => {
        const schedule = this.schedules.get(id)!;
        schedule.status = 'released';
        return Promise.resolve(schedule);
      },
    },
  };
}

interface SubscriptionRow {
  status: string;
  current_period_end: Date;
  stripe_schedule_id: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: Date | null;
}

/**
 * The Stripe-backed billing flows (plan change, cancel, reactivate, reconciliation), run as the
 * app's database role: they must find the tenant's subscription under RLS.
 */
describe('Stripe subscription lifecycle (app role, RLS enforced)', () => {
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

    // Plans are reference data kept across tests: set Stripe prices here and restore them after
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
    stripe.schedules.clear();
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

  async function subscriptionOf(tenantId: string): Promise<SubscriptionRow> {
    const result = await app.databaseService.query<SubscriptionRow>(
      `SELECT status, current_period_end, stripe_schedule_id, cancel_at_period_end, cancelled_at
       FROM public.tenant_subscriptions WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(result.rows).toHaveLength(1);
    return result.rows[0];
  }

  /** A tenant on Shield, billed through a (fake) Stripe subscription, with an admin. */
  async function stripeBackedTenant(extraItems: FakeItem[] = []): Promise<{
    tenantId: string;
    stripeSubscriptionId: string;
    adminEmail: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    const stripeSubscriptionId = `sub_test_${randomUUID()}`;
    await app.databaseService.query(
      `UPDATE public.tenant_subscriptions
       SET stripe_subscription_id = $2, current_period_start = to_timestamp($3), current_period_end = to_timestamp($4)
       WHERE tenant_id = $1`,
      [tenant.id, stripeSubscriptionId, stripe.periodStart, stripe.periodEnd],
    );
    stripe.addSubscription(stripeSubscriptionId, extraItems);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    return {
      tenantId: tenant.id,
      stripeSubscriptionId,
      adminEmail: user.email,
    };
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

  it('schedules a plan change, reports it as pending, then cancels it', async () => {
    const { tenantId, adminEmail } = await stripeBackedTenant();
    const cookie = await tenantAdminCookie(adminEmail, tenantId);

    const scheduled = await server.inject({
      method: 'POST',
      url: '/api/v1/billing/plan/change',
      headers: { cookie },
      payload: { planKey: 'infrastructure' },
    });
    expect(scheduled.statusCode).toBe(200);
    const { stripeScheduleId, newPlanKey } = scheduled.json<{
      stripeScheduleId: string;
      newPlanKey: string;
    }>();
    expect(newPlanKey).toBe('infrastructure');
    expect((await subscriptionOf(tenantId)).stripe_schedule_id).toBe(
      stripeScheduleId,
    );
    expect(
      stripe.schedules.get(stripeScheduleId)?.phases[1]?.items[0]?.price,
    ).toBe(INFRASTRUCTURE_PRICE);

    const pending = await server.inject({
      method: 'GET',
      url: '/api/v1/billing/plan/pending-change',
      headers: { cookie },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toMatchObject({
      hasPendingChange: true,
      newPlanKey: 'infrastructure',
    });

    const cancelled = await server.inject({
      method: 'POST',
      url: '/api/v1/billing/plan/cancel-change',
      headers: { cookie },
    });
    expect(cancelled.statusCode).toBe(204);
    expect((await subscriptionOf(tenantId)).stripe_schedule_id).toBeNull();
    expect(stripe.schedules.get(stripeScheduleId)?.status).toBe('released');
  });

  it('cancels at period end, then reactivates', async () => {
    const { tenantId, stripeSubscriptionId, adminEmail } =
      await stripeBackedTenant();
    const cookie = await tenantAdminCookie(adminEmail, tenantId);

    const cancelled = await server.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/cancel',
      headers: { cookie },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(
      new Date(cancelled.json<{ cancelsAt: string }>().cancelsAt).getTime(),
    ).toBe(stripe.periodEnd * 1000);
    expect(
      stripe.subscriptions.get(stripeSubscriptionId)?.cancel_at_period_end,
    ).toBe(true);
    expect(await subscriptionOf(tenantId)).toMatchObject({
      status: 'active',
      cancel_at_period_end: true,
      cancelled_at: expect.any(Date),
    });

    const reactivated = await server.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/reactivate',
      headers: { cookie },
    });
    expect(reactivated.statusCode).toBe(204);
    expect(
      stripe.subscriptions.get(stripeSubscriptionId)?.cancel_at_period_end,
    ).toBe(false);
    expect(await subscriptionOf(tenantId)).toMatchObject({
      cancel_at_period_end: false,
      cancelled_at: null,
    });
  });

  describe('reconciliation', () => {
    async function createAddon(stripePriceId: string): Promise<string> {
      const addon = await app.databaseService.query<{ id: string }>(
        `INSERT INTO public.addons (key, name, stripe_price_id) VALUES ($1, 'Reconciliation add-on', $2)
         RETURNING id`,
        [`recon-${randomUUID()}`, stripePriceId],
      );
      return addon.rows[0].id;
    }

    async function activeAddonItems(tenantId: string): Promise<string[]> {
      const result = await app.databaseService.query<{ item: string }>(
        `SELECT stripe_subscription_item_id AS item FROM public.tenant_addons
         WHERE tenant_id = $1 AND status = 'active' ORDER BY 1`,
        [tenantId],
      );
      return result.rows.map((row) => row.item);
    }

    it('repairs subscription drift for every Stripe-backed tenant', async () => {
      const a = await stripeBackedTenant();
      const b = await stripeBackedTenant();
      // A's period and B's status have drifted from Stripe
      await app.databaseService.query(
        `UPDATE public.tenant_subscriptions SET current_period_end = now() + interval '1 day' WHERE tenant_id = $1`,
        [a.tenantId],
      );
      await app.databaseService.query(
        `UPDATE public.tenant_subscriptions SET status = 'past_due' WHERE tenant_id = $1`,
        [b.tenantId],
      );

      const report = await app.module
        .get(StripeReconciliationService)
        .reconcileAll();

      // The report lists status drift under errors, as it found it
      expect(report.errors).toEqual([
        expect.objectContaining({
          type: 'status_mismatch',
          tenant_id: b.tenantId,
        }),
      ]);
      expect(report).toMatchObject({ checked: 2, fixed: 2 });
      expect(
        (await subscriptionOf(a.tenantId)).current_period_end.getTime(),
      ).toBe(stripe.periodEnd * 1000);
      expect((await subscriptionOf(b.tenantId)).status).toBe('active');
    });

    it("reconciling one tenant checks only that tenant's subscription", async () => {
      const a = await stripeBackedTenant();
      await stripeBackedTenant();

      const report = await app.module
        .get(StripeReconciliationService)
        .reconcile(a.tenantId);

      expect(report).toMatchObject({ checked: 1, in_sync: 1, errors: [] });
    });

    it("sees the tenant's add-ons: keeps one in sync and cancels one Stripe no longer has", async () => {
      const kept = stripe.item(`si_addon_${randomUUID()}`, ADDON_PRICE, 1);
      const { tenantId } = await stripeBackedTenant([kept]);
      const staleItem = `si_gone_${randomUUID()}`;
      // Both add-ons are active in the DB; Stripe only still bills the first
      await app.databaseService.query(
        `INSERT INTO public.tenant_addons (tenant_id, addon_id, quantity, status, stripe_subscription_item_id)
         VALUES ($1, $2, 1, 'active', $3), ($1, $4, 1, 'active', $5)`,
        [
          tenantId,
          await createAddon(ADDON_PRICE),
          kept.id,
          await createAddon(`price_test_retired_${randomUUID()}`),
          staleItem,
        ],
      );

      const report = await app.module
        .get(StripeReconciliationService)
        .reconcile(tenantId);

      expect(report.errors).toEqual([]);
      expect(await activeAddonItems(tenantId)).toEqual([kept.id]);
    });
  });

  it('a tenant-scoped repository query with no context fails loudly instead of returning nothing', async () => {
    const { tenantId } = await stripeBackedTenant();
    const subscriptions = app.module.get(SubscriptionsRepository);

    await expect(subscriptions.findActiveByTenant(tenantId)).rejects.toThrow(
      /row-level security/,
    );
    await expect(
      subscriptions.findActiveByTenant(tenantId, {
        tenant: { tenantId, schema: 'public' },
      }),
    ).resolves.toMatchObject({ tenant_id: tenantId });
  });
});

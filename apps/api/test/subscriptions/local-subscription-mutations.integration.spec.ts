import { ConflictException } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { TrialExpiryHandler } from 'src/modules/entitlements/processors/trial-expiry.handler';
import { SubscriptionsService } from 'src/modules/subscriptions/subscriptions.service';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

interface SubscriptionRow {
  plan_key: string;
  status: string;
  current_period_end: Date;
  stripe_subscription_id: string | null;
}

/**
 * A Stripe-backed subscription's plan, status and period change only through Stripe calls and
 * webhooks. No local route or service may rewrite them (a free upgrade, or a "cancel" that keeps
 * charging the card).
 */
describe('Local subscription mutations', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let subscriptions: SubscriptionsService;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    subscriptions = app.module.get(SubscriptionsService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function subscriptionOf(tenantId: string): Promise<SubscriptionRow> {
    const result = await app.databaseService.query<SubscriptionRow>(
      `SELECT p.key AS plan_key, s.status, s.current_period_end, s.stripe_subscription_id
       FROM public.tenant_subscriptions s JOIN public.plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1`,
      [tenantId],
    );
    expect(result.rows).toHaveLength(1);
    return result.rows[0];
  }

  /** A tenant on Shield whose subscription is billed through Stripe. */
  async function stripeBackedTenant(): Promise<{
    tenantId: string;
    adminId: string;
    adminEmail: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    await app.databaseService.query(
      `UPDATE public.tenant_subscriptions SET stripe_subscription_id = $2 WHERE tenant_id = $1`,
      [tenant.id, `sub_test_${tenant.id.slice(0, 8)}`],
    );
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    return { tenantId: tenant.id, adminId: user.id, adminEmail: user.email };
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

  // Plan changes and cancellations go through /billing/* (Stripe) only; this guards against
  // local mutation routes coming back.
  it('has no local change-plan, cancel or renew routes, even for a tenant admin', async () => {
    const { tenantId, adminEmail } = await stripeBackedTenant();
    const cookie = await tenantAdminCookie(adminEmail, tenantId);
    const before = await subscriptionOf(tenantId);

    const calls: [string, Record<string, unknown> | undefined][] = [
      ['change-plan', { planKey: 'infrastructure' }],
      ['cancel', undefined],
      ['renew', undefined],
    ];
    for (const [route, payload] of calls) {
      const res: InjectResponse = await server.inject({
        method: 'POST',
        url: `/api/v1/subscriptions/${route}`,
        headers: { cookie },
        ...(payload ? { payload } : {}),
      });
      expect(`${route} ${res.statusCode}`).toBe(`${route} 404`);
    }

    expect(await subscriptionOf(tenantId)).toEqual(before);
  });

  it('refuses to renew a Stripe-backed subscription in the service', async () => {
    const { tenantId } = await stripeBackedTenant();
    const before = await subscriptionOf(tenantId);

    await expect(subscriptions.renewPeriod(tenantId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(await subscriptionOf(tenantId)).toEqual(before);
  });

  it('still renews a local (non-Stripe) subscription', async () => {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'navigator',
    });
    const before = await subscriptionOf(tenant.id);

    await subscriptions.renewPeriod(tenant.id);

    const after = await subscriptionOf(tenant.id);
    expect(after.current_period_end.getTime()).toBeGreaterThan(
      before.current_period_end.getTime(),
    );
  });

  it('trial expiry converts local trials but never a Stripe-backed subscription', async () => {
    const expireTrial = async (tenantId: string): Promise<void> => {
      await app.databaseService.query(
        `UPDATE public.tenant_subscriptions
         SET status = 'trialing', trial_ends_at = NOW() - INTERVAL '1 day'
         WHERE tenant_id = $1`,
        [tenantId],
      );
    };
    const local = await createTestTenant(app.module);
    await createTestSubscription(app.module, local.id, { planKey: 'shield' });
    await expireTrial(local.id);
    const { tenantId: stripeTenantId } = await stripeBackedTenant();
    await expireTrial(stripeTenantId);

    await app.module.get(TrialExpiryHandler).execute({ data: {} } as never);

    expect(await subscriptionOf(local.id)).toMatchObject({
      plan_key: 'navigator',
      status: 'active',
    });
    expect(await subscriptionOf(stripeTenantId)).toMatchObject({
      plan_key: 'shield',
      status: 'trialing',
    });
  });
});

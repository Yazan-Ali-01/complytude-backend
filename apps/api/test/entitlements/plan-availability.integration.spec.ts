import type { FastifyInstance } from 'fastify';
import {
  FEATURE_CATALOG,
  PLAN_CATALOG,
} from 'src/common/constants/plan-entitlements.constant';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

interface Entitlement {
  featureKey: string;
  availability: 'available' | 'coming_soon';
}

/**
 * Plan features that aren't built are shown as coming soon (D-4): the plans API and a tenant's
 * current entitlements say which, so the frontend never presents one as included.
 */
describe('Plan feature availability', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function expectCatalogAvailability(
    entitlements: Record<string, Entitlement>,
  ): void {
    for (const [key, entitlement] of Object.entries(entitlements)) {
      expect(`${key} ${entitlement.availability}`).toBe(
        `${key} ${FEATURE_CATALOG[key as keyof typeof FEATURE_CATALOG].availability}`,
      );
    }
    expect(entitlements.redlining_enabled.availability).toBe('coming_soon');
    expect(entitlements.documents_per_month.availability).toBe('available');
  }

  it('lists every plan with each feature marked available or coming soon', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/entitlements/plans',
    });

    expect(res.statusCode).toBe(200);
    const plans = res.json<
      Array<{
        key: keyof typeof PLAN_CATALOG;
        description: string;
        entitlements: Record<string, Entitlement>;
      }>
    >();
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expectCatalogAvailability(plan.entitlements);
      expect(plan.description).toBe(PLAN_CATALOG[plan.key].description);
    }

    const one = await server.inject({
      method: 'GET',
      url: '/api/v1/entitlements/plans/general_counsel',
    });
    expect(one.statusCode).toBe(200);
    expectCatalogAvailability(
      one.json<{ entitlements: Record<string, Entitlement> }>().entitlements,
    );
  });

  it("marks a tenant's current entitlements the same way", async () => {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'general_counsel',
    });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.MEMBER,
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: {
        cookie: cookieHeaderFromSetCookie(
          login.headers as Record<string, string | string[] | undefined>,
        ),
      },
      payload: { tenantId: tenant.id },
    });
    expect(switched.statusCode).toBe(200);

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/entitlements/current',
      headers: {
        cookie: cookieHeaderFromSetCookie(
          switched.headers as Record<string, string | string[] | undefined>,
        ),
      },
    });

    expect(res.statusCode).toBe(200);
    expectCatalogAvailability(
      res.json<{ entitlements: Record<string, Entitlement> }>().entitlements,
    );
  });
});

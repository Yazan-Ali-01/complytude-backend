import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { SessionService } from 'src/modules/auth/services/session.service';
import {
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

type Headers = Record<string, string | string[] | undefined>;

/**
 * A platform admin deactivating a tenant cuts its members off at once: tokens they already hold
 * stop working, they can't refresh or switch back in, and it disappears from their tenant lists.
 * Reactivating restores access. HTTP, as the app role.
 */
describe('Tenant deactivation', () => {
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

  function call(
    method: 'GET' | 'POST',
    url: string,
    cookie: string,
    payload?: Record<string, unknown>,
  ): Promise<InjectResponse> {
    return server.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie },
      ...(payload ? { payload } : {}),
    });
  }

  async function login(email: string): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Test123!@#' },
    });
    expect(res.statusCode).toBe(200);
    return cookieHeaderFromSetCookie(res.headers as Headers);
  }

  /** A member signed in to the tenant: identity + tenant cookies. */
  async function memberIn(
    tenantId: string,
  ): Promise<{ userId: string; identity: string; cookie: string }> {
    const { user } = await createTestUserInTenant(app.module, tenantId, {
      role: SystemTenantRole.MEMBER,
    });
    const identity = await login(user.email);
    const switched = await call('POST', '/auth/tenant-switch', identity, {
      tenantId,
    });
    expect(switched.statusCode).toBe(200);
    return {
      userId: user.id,
      identity,
      cookie: `${identity}; ${cookieHeaderFromSetCookie(switched.headers as Headers)}`,
    };
  }

  async function platformAdmin(): Promise<string> {
    const admin = await createTestUser(app.module, {
      platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
    });
    return login(admin.email);
  }

  it('cuts members off at once and restores them on reactivation', async () => {
    const tenant = await createTestTenant(app.module);
    const member = await memberIn(tenant.id);
    const admin = await platformAdmin();
    expect(
      (await call('GET', '/users/me/current-tenant', member.cookie)).statusCode,
    ).toBe(200);

    const deactivated = await call(
      'POST',
      `/admin/tenants/${tenant.id}/deactivate`,
      admin,
      { reason: 'Contract ended, suspend access' },
    );
    expect(deactivated.statusCode).toBe(200);

    // The token they already hold stops working, and so does refreshing it
    expect(
      (await call('GET', '/users/me/current-tenant', member.cookie)).statusCode,
    ).toBe(401);
    expect(
      (await call('POST', '/auth/refresh-tenant', member.cookie)).statusCode,
    ).toBe(401);
    // Their tenant sessions are gone, not just refused
    expect(
      await app.module
        .get(SessionService)
        .getTenantSessionIds(member.userId, tenant.id),
    ).toEqual([]);
    // No way back in, and the tenant is no longer offered
    expect(
      (
        await call('POST', '/auth/tenant-switch', member.identity, {
          tenantId: tenant.id,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await call('GET', '/users/me/tenants', member.identity)).json(),
    ).toEqual([]);
    // Their identity session (other tenants, profile) is untouched
    expect((await call('GET', '/users/me', member.identity)).statusCode).toBe(
      200,
    );

    const reactivated = await call(
      'POST',
      `/admin/tenants/${tenant.id}/reactivate`,
      admin,
    );
    expect(reactivated.statusCode).toBe(200);
    const back = await call('POST', '/auth/tenant-switch', member.identity, {
      tenantId: tenant.id,
    });
    expect(back.statusCode).toBe(200);
    const cookie = `${member.identity}; ${cookieHeaderFromSetCookie(back.headers as Headers)}`;
    expect(
      (await call('GET', '/users/me/current-tenant', cookie)).statusCode,
    ).toBe(200);
  });

  it("doesn't affect other tenants", async () => {
    const suspended = await createTestTenant(app.module);
    const other = await createTestTenant(app.module);
    await memberIn(suspended.id);
    const bystander = await memberIn(other.id);

    await call(
      'POST',
      `/admin/tenants/${suspended.id}/deactivate`,
      await platformAdmin(),
      { reason: 'Contract ended, suspend access' },
    );

    expect(
      (await call('GET', '/users/me/current-tenant', bystander.cookie))
        .statusCode,
    ).toBe(200);
  });
});

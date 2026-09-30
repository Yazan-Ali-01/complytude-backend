import type { FastifyInstance } from 'fastify';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import {
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp } from '../setup/test-app.factory';

describe('Session HTTP endpoints', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
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

  it('GET /auth/sessions and /auth/sessions/all return structured session lists', async () => {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });

    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    expect(loginRes.statusCode).toBe(200);
    const idCookies = cookieHeaderFromSetCookie(
      loginRes.headers as Record<string, string | string[] | undefined>,
    );

    const switchRes = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: idCookies, 'content-type': 'application/json' },
      payload: { tenantId: tenant.id },
    });
    expect(switchRes.statusCode).toBe(200);
    const allCookies = cookieHeaderFromSetCookie({
      'set-cookie': [
        ...(Array.isArray(loginRes.headers['set-cookie'])
          ? loginRes.headers['set-cookie']
          : loginRes.headers['set-cookie']
            ? [loginRes.headers['set-cookie']]
            : []),
        ...(Array.isArray(switchRes.headers['set-cookie'])
          ? switchRes.headers['set-cookie']
          : switchRes.headers['set-cookie']
            ? [switchRes.headers['set-cookie']]
            : []),
      ],
    });

    const listAll = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions/all',
      headers: { cookie: idCookies },
    });
    expect(listAll.statusCode).toBe(200);
    const allBody = JSON.parse(listAll.body) as { sessions: unknown[] };
    expect(Array.isArray(allBody.sessions)).toBe(true);
    expect(allBody.sessions.length).toBeGreaterThan(0);

    const listTenant = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: { cookie: allCookies },
    });
    expect(listTenant.statusCode).toBe(200);
    const tenantBody = JSON.parse(listTenant.body) as { sessions: unknown[] };
    expect(Array.isArray(tenantBody.sessions)).toBe(true);
  });

  it('GET /admin/sessions/stats responds for system_admin', async () => {
    const adminUser = await createTestUser(app.module, {
      platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
    });

    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'Test123!@#' },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookies = cookieHeaderFromSetCookie(
      loginRes.headers as Record<string, string | string[] | undefined>,
    );

    const stats = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/sessions/stats',
      headers: { cookie: cookies },
    });
    expect(stats.statusCode).toBe(200);
    const body = JSON.parse(stats.body) as {
      totalIdentitySessions: number;
      totalTenantSessions: number;
    };
    expect(typeof body.totalIdentitySessions).toBe('number');
    expect(typeof body.totalTenantSessions).toBe('number');
  });

  it('GET /tenants/admin/users/:userId/sessions responds for tenant admin with permission', async () => {
    const tenant = await createTestTenant(app.module);
    const { user: tenantAdmin } = await createTestUserInTenant(
      app.module,
      tenant.id,
      { role: SystemTenantRole.TENANT_ADMIN },
    );
    const { user: member } = await createTestUserInTenant(
      app.module,
      tenant.id,
      {
        role: SystemTenantRole.MEMBER,
      },
    );

    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: tenantAdmin.email, password: 'Test123!@#' },
    });
    expect(loginRes.statusCode).toBe(200);
    const idCookies = cookieHeaderFromSetCookie(
      loginRes.headers as Record<string, string | string[] | undefined>,
    );

    const switchRes = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: idCookies, 'content-type': 'application/json' },
      payload: { tenantId: tenant.id },
    });
    expect(switchRes.statusCode).toBe(200);
    const allCookies = cookieHeaderFromSetCookie({
      'set-cookie': [
        ...(Array.isArray(loginRes.headers['set-cookie'])
          ? loginRes.headers['set-cookie']
          : loginRes.headers['set-cookie']
            ? [loginRes.headers['set-cookie']]
            : []),
        ...(Array.isArray(switchRes.headers['set-cookie'])
          ? switchRes.headers['set-cookie']
          : switchRes.headers['set-cookie']
            ? [switchRes.headers['set-cookie']]
            : []),
      ],
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/tenants/admin/users/${member.id}/sessions`,
      headers: { cookie: allCookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);

    // A user ID that isn't a UUID is a bad request, not a database error
    for (const [method, url] of [
      ['GET', '/api/v1/tenants/admin/users/not-a-uuid/sessions'],
      ['DELETE', '/api/v1/tenants/admin/users/not-a-uuid/sessions'],
    ] as const) {
      const bad = await server.inject({
        method,
        url,
        headers: { cookie: allCookies },
      });
      expect(`${method} ${bad.statusCode}`).toBe(`${method} 400`);
    }
  });
});

import type { FastifyInstance } from 'fastify';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { AuthService } from 'src/modules/auth/auth.service';
import { SessionService } from 'src/modules/auth/services/session.service';
import type { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp } from '../setup/test-app.factory';

describe('Session lifecycle (login → tenant session → logout)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let authService: AuthService;
  let sessionService: SessionService;

  beforeAll(async () => {
    app = await createTestApp();
    authService = app.module.get(AuthService);
    sessionService = app.module.get(SessionService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  it('creates identity session on login, tenant session on switch, removes identity on logout', async () => {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });

    const fastify = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    const loginRes = await fastify.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
      headers: {
        'user-agent': 'jest-integration',
        'x-forwarded-for': '8.8.8.8',
      },
    });
    expect(loginRes.statusCode).toBe(200);

    const identityIds = await sessionService.getIdentitySessionIds(user.id);
    expect(identityIds).toHaveLength(1);
    const identitySessionId = identityIds[0];

    const stored =
      await sessionService.findIdentitySessionById(identitySessionId);
    expect(stored?.userId).toBe(user.id);
    expect(stored?.activeTenantSessionIds).toEqual([]);

    const identityUser: AuthenticatedIdentityUser = {
      userId: user.id,
      email: user.email,
      isVerified: true,
      platformRole: null,
      sessionId: identitySessionId,
    };

    await authService.tenantSwitch(identityUser, tenant.id);

    const idsAfterSwitch = await sessionService.getIdentitySessionIds(user.id);
    expect(idsAfterSwitch).toEqual([identitySessionId]);

    const identityAfter =
      await sessionService.findIdentitySessionById(identitySessionId);
    expect(identityAfter?.activeTenantSessionIds.length).toBe(1);

    const tenantSids = await sessionService.getTenantSessionIds(
      user.id,
      tenant.id,
    );
    expect(tenantSids).toHaveLength(1);

    await authService.logout(user.id, identitySessionId);

    expect(await sessionService.getIdentitySessionIds(user.id)).toEqual([]);
    expect(
      await sessionService.getTenantSessionIds(user.id, tenant.id),
    ).toEqual([]);
  });
});

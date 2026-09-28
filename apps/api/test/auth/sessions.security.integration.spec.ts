import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { AuthService } from 'src/modules/auth/auth.service';
import type {
  IdentitySessionData,
  TenantSessionData,
} from 'src/modules/auth/interfaces/session.interface';
import { SessionInvalidationService } from 'src/modules/auth/services/session-invalidation.service';
import { SessionService } from 'src/modules/auth/services/session.service';
import { UsersService } from 'src/modules/users/users.service';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp } from '../setup/test-app.factory';

describe('Session security events', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let authService: AuthService;
  let sessionService: SessionService;
  let sessionInvalidationService: SessionInvalidationService;
  let usersService: UsersService;

  beforeAll(async () => {
    app = await createTestApp();
    authService = app.module.get(AuthService);
    sessionService = app.module.get(SessionService);
    sessionInvalidationService = app.module.get(SessionInvalidationService);
    usersService = app.module.get(UsersService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function loginWithRequest(
    email: string,
    password: string,
  ): Promise<void> {
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    } as Parameters<AuthService['login']>[1];
    await authService.login({ email, password }, req);
  }

  async function seedTenantSessionPair(
    userId: string,
    email: string,
    tenantId: string,
    roleKey: string,
  ): Promise<void> {
    const identitySessionId = randomUUID();
    const tenantSessionId = randomUUID();
    const now = new Date().toISOString();
    const identity: IdentitySessionData = {
      userId,
      email,
      platformRole: null,
      isVerified: true,
      deviceInfo: {
        deviceType: 'desktop',
        browserName: 'jest',
        browserVersion: '1',
        operatingSystem: 'Linux',
      },
      ipAddress: '127.0.0.1',
      geoLocation: null,
      sessionName: null,
      activeTenantSessionIds: [],
      createdAt: now,
      lastActivityAt: now,
    };
    await sessionService.enforceSessionLimit(userId, identitySessionId);
    await sessionService.createIdentitySession(identitySessionId, identity);

    const tenantData: TenantSessionData = {
      userId,
      tenantId,
      role: roleKey,
      identitySessionId,
      createdAt: now,
      lastActivityAt: now,
    };
    await sessionService.createTenantSession(
      tenantSessionId,
      tenantData,
      identitySessionId,
    );
  }

  it("changePassword removes the user's other Redis sessions and keeps the current one", async () => {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id);

    await loginWithRequest(user.email, 'Test123!@#');
    await loginWithRequest(user.email, 'Test123!@#');
    const [current, other] = await sessionService.getIdentitySessionIds(
      user.id,
    );
    expect(other).toBeDefined();

    await usersService.changePassword(user.id, current, {
      currentPassword: 'Test123!@#',
      newPassword: 'NewTest123!@#Xy',
    });

    expect(await sessionService.getIdentitySessionIds(user.id)).toEqual([
      current,
    ]);
  });

  it('invalidateTenantSessions clears Redis tenant scope (same as role-change / deactivate hooks)', async () => {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.MEMBER,
    });

    await seedTenantSessionPair(
      user.id,
      user.email,
      tenant.id,
      SystemTenantRole.MEMBER,
    );

    expect(
      (await sessionService.getTenantSessionIds(user.id, tenant.id)).length,
    ).toBe(1);

    await sessionInvalidationService.invalidateTenantSessions(
      user.id,
      tenant.id,
    );

    expect(
      await sessionService.getTenantSessionIds(user.id, tenant.id),
    ).toEqual([]);

    const ids = await sessionService.getIdentitySessionIds(user.id);
    expect(ids).toHaveLength(1);
    const identityAfter = await sessionService.findIdentitySessionById(ids[0]);
    expect(identityAfter?.activeTenantSessionIds ?? []).toEqual([]);
  });
});

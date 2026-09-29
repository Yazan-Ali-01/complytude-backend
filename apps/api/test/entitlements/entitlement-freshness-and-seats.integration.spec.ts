import { RedisService } from '@lib/redis';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { EntitlementCacheService } from 'src/modules/entitlements/services/entitlement-cache.service';
import { EntitlementResolverService } from 'src/modules/entitlements/services/entitlement-resolver.service';
import { InvitationsService } from 'src/modules/invitations/invitations.service';
import { UsersService } from 'src/modules/users/users.service';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Entitlements stay current across processes and time (cache invalidation reaches every API
 * process; a snapshot ends when an override it includes expires), and seats can't be oversold by
 * concurrent requests or by reactivating members.
 */
describe('Entitlement freshness and seat limits', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  it('a subscription change handled by one process clears the cached subscription in every other', async () => {
    // A second API process: its own cache, the same Redis
    const other = new EntitlementCacheService(
      app.module.get(ConfigService),
      app.module.get(RedisService),
    );
    await other.onModuleInit();
    try {
      const tenantId = randomUUID();
      other.setSubscription(tenantId, {
        id: randomUUID(),
        tenant_id: tenantId,
        plan_id: randomUUID(),
        status: 'active',
        current_period_start: new Date(),
        current_period_end: new Date(),
      });
      expect(other.getSubscription(tenantId)).not.toBeNull();

      app.module.get(EntitlementCacheService).invalidateSubscription(tenantId);

      let cleared = false;
      for (let i = 0; i < 40 && !cleared; i++) {
        cleared = other.getSubscription(tenantId) === null;
        if (!cleared) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(cleared).toBe(true);
    } finally {
      other.onModuleDestroy();
    }
  });

  it('an entitlement snapshot ends when an override it includes expires', async () => {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const expiresAt = new Date(Date.now() + 90 * 60 * 1000);
    await app.databaseService.query(
      `INSERT INTO public.tenant_overrides (tenant_id, feature_id, value_int, reason, applied_by, expires_at)
       SELECT $1, id, 50, 'goodwill', $2, $3 FROM public.features WHERE key = 'user_seats'`,
      [tenant.id, user.id, expiresAt],
    );

    const { validUntil } = await app.module
      .get(EntitlementResolverService)
      .computeForTenant(tenant.id);

    expect(validUntil?.getTime()).toBe(expiresAt.getTime());
  });

  describe('seats', () => {
    async function memberRoleId(): Promise<string> {
      const { rows } = await app.databaseService.query<{ id: string }>(
        `SELECT id FROM public.tenant_roles WHERE key = 'member' AND tenant_id IS NULL`,
      );
      return rows[0].id;
    }

    /** A Shield tenant (3 seats) with its admin and `members` more active members. */
    async function shieldTenant(members: number): Promise<{
      tenantId: string;
      adminId: string;
      memberIds: string[];
    }> {
      const tenant = await createTestTenant(app.module);
      await createTestSubscription(app.module, tenant.id, {
        planKey: 'shield',
      });
      const { user: admin } = await createTestUserInTenant(
        app.module,
        tenant.id,
        { role: SystemTenantRole.TENANT_ADMIN },
      );
      const memberIds: string[] = [];
      for (let i = 0; i < members; i++) {
        const { user } = await createTestUserInTenant(app.module, tenant.id, {
          role: SystemTenantRole.MEMBER,
        });
        memberIds.push(user.id);
      }
      return { tenantId: tenant.id, adminId: admin.id, memberIds };
    }

    it('two invitations racing for the last seat: only one is sent', async () => {
      const { tenantId, adminId } = await shieldTenant(1);
      const roleId = await memberRoleId();
      // Widen the window between counting the seats and inserting, as a slow request would
      const resolver = app.module.get(EntitlementResolverService);
      const resolve = resolver.resolveForTenant.bind(resolver);
      jest
        .spyOn(resolver, 'resolveForTenant')
        .mockImplementation(async (...args) => {
          await new Promise((r) => setTimeout(r, 150));
          return resolve(...args);
        });
      const invitations = app.module.get(InvitationsService);

      const results = await Promise.allSettled(
        ['a', 'b'].map((who) =>
          invitations.createInvitation({
            tenantId,
            invitedBy: adminId,
            email: `${who}-${randomUUID().slice(0, 8)}@test.com`,
            roleId,
          }),
        ),
      );

      expect(results.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
    });

    it('a member is not reactivated while the workspace is at its seat limit', async () => {
      const { tenantId, adminId, memberIds } = await shieldTenant(2);
      const users = app.module.get(UsersService);
      const actor = {
        userId: adminId,
        tenantId,
        role: SystemTenantRole.TENANT_ADMIN,
      };
      await users.updateMember(actor, memberIds[0], { isActive: false });
      // The freed seat is taken
      await createTestUserInTenant(app.module, tenantId, {
        role: SystemTenantRole.MEMBER,
      });

      await expect(
        users.updateMember(actor, memberIds[0], { isActive: true }),
      ).rejects.toMatchObject({ status: 403 });

      // With a seat free again, it is
      await users.updateMember(actor, memberIds[1], { isActive: false });
      await expect(
        users.updateMember(actor, memberIds[0], { isActive: true }),
      ).resolves.toMatchObject({ is_active: true });
    });
  });
});

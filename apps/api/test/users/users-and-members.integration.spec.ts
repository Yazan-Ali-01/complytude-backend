import * as bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';

type Headers = Record<string, string | string[] | undefined>;

/**
 * The signed-in user's account (/users/me*) and tenant member management
 * (/tenants/admin/users), over HTTP as the app role, so RLS applies as deployed.
 */
describe('Users and tenant members', () => {
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
    method: 'GET' | 'PATCH' | 'DELETE' | 'POST',
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

  /** Signs in (one "device"); returns the identity cookies, or null if refused. */
  async function login(
    email: string,
    password = PASSWORD,
  ): Promise<string | null> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    return res.statusCode === 200
      ? cookieHeaderFromSetCookie(res.headers as Headers)
      : null;
  }

  /** Signs in and switches into the tenant: identity and tenant cookies, as a browser holds. */
  async function signInTo(email: string, tenantId: string): Promise<string> {
    const identity = (await login(email))!;
    const switched = await call('POST', '/auth/tenant-switch', identity, {
      tenantId,
    });
    expect(switched.statusCode).toBe(200);
    return `${identity}; ${cookieHeaderFromSetCookie(switched.headers as Headers)}`;
  }

  async function passwordHash(userId: string): Promise<string> {
    const { rows } = await app.databaseService.query<{
      password_hash: string;
    }>('SELECT password_hash FROM public.users WHERE id = $1', [userId]);
    return rows[0].password_hash;
  }

  async function team(): Promise<{
    tenantId: string;
    tenantName: string;
    admin: { id: string; email: string };
    member: { id: string; email: string };
  }> {
    const tenant = await createTestTenant(app.module);
    const { user: admin } = await createTestUserInTenant(
      app.module,
      tenant.id,
      { role: SystemTenantRole.TENANT_ADMIN },
    );
    const { user: member } = await createTestUserInTenant(
      app.module,
      tenant.id,
      { role: SystemTenantRole.MEMBER },
    );
    return {
      tenantId: tenant.id,
      tenantName: tenant.name!,
      admin: { id: admin.id, email: admin.email },
      member: { id: member.id, email: member.email },
    };
  }

  describe('/users/me', () => {
    it('a password change replaces the hash and signs out every other session', async () => {
      const { member } = await team();
      const thisDevice = (await login(member.email))!;
      const otherDevice = (await login(member.email))!;
      const before = await passwordHash(member.id);

      const res = await call('PATCH', '/users/me/password', thisDevice, {
        currentPassword: PASSWORD,
        newPassword: 'N3w-Passw0rd!x',
      });

      expect(res.statusCode).toBe(200);
      const after = await passwordHash(member.id);
      expect(after).not.toBe(before);
      expect(await bcrypt.compare('N3w-Passw0rd!x', after)).toBe(true);
      expect((await call('GET', '/users/me', otherDevice)).statusCode).toBe(
        401,
      );
      expect((await call('GET', '/users/me', thisDevice)).statusCode).toBe(200);
      expect(await login(member.email, PASSWORD)).toBeNull();
      expect(await login(member.email, 'N3w-Passw0rd!x')).not.toBeNull();
    });

    it('refuses a wrong current password and changes nothing', async () => {
      const { member } = await team();
      const cookie = (await login(member.email))!;
      const before = await passwordHash(member.id);

      const res = await call('PATCH', '/users/me/password', cookie, {
        currentPassword: 'not-my-password',
        newPassword: 'N3w-Passw0rd!x',
      });

      expect(res.statusCode).toBe(400);
      expect(await passwordHash(member.id)).toBe(before);
    });

    it('reads and updates the profile', async () => {
      const { member } = await team();
      const cookie = (await login(member.email))!;

      const updated = await call('PATCH', '/users/me', cookie, {
        firstName: 'Mariam',
      });
      expect(updated.statusCode).toBe(200);

      expect((await call('GET', '/users/me', cookie)).json()).toMatchObject({
        id: member.id,
        email: member.email,
        firstName: 'Mariam',
      });
    });

    it('shows real tenant names in /me/tenants, the current tenant and the tenant switch', async () => {
      const { tenantId, tenantName, member } = await team();
      const identity = (await login(member.email))!;

      expect((await call('GET', '/users/me/tenants', identity)).json()).toEqual(
        [
          expect.objectContaining({
            tenantId,
            tenantName,
            role: SystemTenantRole.MEMBER,
          }),
        ],
      );
      const switched = await call('POST', '/auth/tenant-switch', identity, {
        tenantId,
      });
      expect(switched.json()).toMatchObject({
        tenant: { id: tenantId, name: tenantName },
      });
      const cookie = await signInTo(member.email, tenantId);
      expect(
        (await call('GET', '/users/me/current-tenant', cookie)).json(),
      ).toMatchObject({ id: tenantId, name: tenantName });
    });
  });

  describe('/tenants/admin/users', () => {
    it('an admin can offboard a member: change their role, turn off access, then remove them', async () => {
      const { tenantId, admin, member } = await team();
      const adminCookie = await signInTo(admin.email, tenantId);
      const memberCookie = await signInTo(member.email, tenantId);

      const list = await call('GET', '/tenants/admin/users', adminCookie);
      expect(list.statusCode).toBe(200);
      expect(
        list
          .json<Array<{ userId: string; role: string }>>()
          .map((m) => `${m.userId}:${m.role}`),
      ).toEqual([
        `${admin.id}:${SystemTenantRole.TENANT_ADMIN}`,
        `${member.id}:${SystemTenantRole.MEMBER}`,
      ]);

      // A role change ends the member's tenant sessions
      const promoted = await call(
        'PATCH',
        `/tenants/admin/users/${member.id}`,
        adminCookie,
        { role: SystemTenantRole.LEGAL_COUNSEL },
      );
      expect(promoted.json()).toMatchObject({
        role: SystemTenantRole.LEGAL_COUNSEL,
        roleName: expect.any(String),
      });
      expect(
        (await call('GET', '/users/me/current-tenant', memberCookie))
          .statusCode,
      ).toBe(401);

      // Deactivated: can't get back in
      const deactivated = await call(
        'PATCH',
        `/tenants/admin/users/${member.id}`,
        adminCookie,
        { isActive: false },
      );
      expect(deactivated.json()).toMatchObject({ isActive: false });
      const memberIdentity = (await login(member.email))!;
      expect(
        (
          await call('POST', '/auth/tenant-switch', memberIdentity, {
            tenantId,
          })
        ).statusCode,
      ).toBe(401);

      const removed = await call(
        'DELETE',
        `/tenants/admin/users/${member.id}`,
        adminCookie,
      );
      expect(removed.statusCode).toBe(200);
      expect(
        (await call('GET', '/users/me/tenants', memberIdentity)).json(),
      ).toEqual([]);
      expect(
        (await call('GET', '/tenants/admin/users', adminCookie))
          .json<Array<{ userId: string }>>()
          .map((m) => m.userId),
      ).toEqual([admin.id]);
    });

    it('refuses an unknown role, changes to yourself, and members without team:manage', async () => {
      const { tenantId, admin, member } = await team();
      const adminCookie = await signInTo(admin.email, tenantId);
      const memberCookie = await signInTo(member.email, tenantId);

      expect(
        (
          await call(
            'PATCH',
            `/tenants/admin/users/${member.id}`,
            adminCookie,
            {
              role: 'overlord',
            },
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await call('PATCH', `/tenants/admin/users/${admin.id}`, adminCookie, {
            role: SystemTenantRole.MEMBER,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await call('DELETE', `/tenants/admin/users/${admin.id}`, adminCookie))
          .statusCode,
      ).toBe(403);
      expect(
        (await call('GET', '/tenants/admin/users', memberCookie)).statusCode,
      ).toBe(403);
      expect(
        (await call('DELETE', `/tenants/admin/users/${admin.id}`, memberCookie))
          .statusCode,
      ).toBe(403);
    });

    it('a team manager who is not a tenant admin cannot touch an admin or grant the role', async () => {
      const { tenantId, admin, member } = await team();
      const { rows } = await app.databaseService.query<{ id: string }>(
        `INSERT INTO public.tenant_roles (key, name, tenant_id) VALUES ('team_lead', 'Team lead', $1)
         RETURNING id`,
        [tenantId],
      );
      await app.databaseService.query(
        `INSERT INTO public.tenant_role_permissions (role_id, permission_id)
         SELECT $1, id FROM public.tenant_permissions WHERE key = 'team:manage'`,
        [rows[0].id],
      );
      const { user: lead } = await createTestUserInTenant(
        app.module,
        tenantId,
        { role: 'team_lead' as SystemTenantRole },
      );
      const leadCookie = await signInTo(lead.email, tenantId);

      // The custom role can manage ordinary members...
      expect(
        (
          await call('PATCH', `/tenants/admin/users/${member.id}`, leadCookie, {
            role: SystemTenantRole.VIEWER,
          })
        ).statusCode,
      ).toBe(200);
      // ...but not admins, and can't make anyone one
      for (const [method, target, payload] of [
        ['PATCH', admin.id, { isActive: false }],
        ['DELETE', admin.id, undefined],
        ['PATCH', member.id, { role: SystemTenantRole.TENANT_ADMIN }],
      ] as const) {
        const res = await call(
          method,
          `/tenants/admin/users/${target}`,
          leadCookie,
          payload,
        );
        expect(`${method} ${res.statusCode}`).toBe(`${method} 403`);
      }
    });

    it('two admins deactivating each other at once leave one active admin', async () => {
      const { tenantId, admin } = await team();
      const { user: second } = await createTestUserInTenant(
        app.module,
        tenantId,
        { role: SystemTenantRole.TENANT_ADMIN },
      );
      const [first, other] = await Promise.all([
        signInTo(admin.email, tenantId),
        signInTo(second.email, tenantId),
      ]);

      const results = await Promise.all([
        call('PATCH', `/tenants/admin/users/${second.id}`, first, {
          isActive: false,
        }),
        call('PATCH', `/tenants/admin/users/${admin.id}`, other, {
          isActive: false,
        }),
      ]);

      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
      const { rows } = await app.databaseService.query(
        `SELECT 1 FROM public.user_tenants WHERE tenant_id = $1 AND role_key = 'tenant_admin' AND is_active`,
        [tenantId],
      );
      expect(rows).toHaveLength(1);
    });
  });
});

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DataRetentionSweepHandler } from 'src/modules/tenant-processing/handlers/data-retention-sweep.handler';
import type { User } from 'src/modules/users/entities/user.entity';
import {
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';

/**
 * A user deletes their own account (D-7): it is closed at once (no sign-in reaches it, memberships
 * and sessions end, the address is free again) and its names and email are erased 30 days later.
 */
describe('Account deletion', () => {
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

  function login(email: string): Promise<LightMyRequestResponse> {
    return server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
  }

  async function identityCookie(email: string): Promise<string> {
    const res = await login(email);
    expect(res.statusCode).toBe(200);
    return cookieHeaderFromSetCookie(
      res.headers as Record<string, string | string[] | undefined>,
    );
  }

  function deleteAccount(
    cookie: string,
    payload: { password?: string },
  ): Promise<LightMyRequestResponse> {
    return server.inject({
      method: 'DELETE',
      url: '/api/v1/users/me',
      headers: { cookie },
      payload,
    });
  }

  async function row(userId: string): Promise<Record<string, unknown>> {
    const { rows } = await app.databaseService.query(
      `SELECT email, deleted_email, first_name, last_name, password_hash, deleted_at,
              anonymized_at
       FROM public.users WHERE id = $1`,
      [userId],
    );
    return rows[0];
  }

  async function memberships(userId: string): Promise<number> {
    const { rows } = await app.databaseService.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM public.user_tenants WHERE user_id = $1',
      [userId],
    );
    return Number(rows[0].n);
  }

  /** A member of an organization that has another admin. */
  async function member(): Promise<User> {
    const tenant = await createTestTenant(app.module);
    await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      first_name: 'Layla',
      last_name: 'Haddad',
    });
    return user;
  }

  it('closes the account at once: no sign-in, no membership, no session; the address is free', async () => {
    const user = await member();
    const cookie = await identityCookie(user.email);

    const res = await deleteAccount(cookie, { password: PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ message: string }>().message).toContain('30');
    // The auth cookies are cleared
    expect(String(res.headers['set-cookie'])).toMatch(/identityAccessToken=;/);
    const closed = await row(user.id);
    expect(closed).toMatchObject({
      email: `deleted-${user.id}@deleted.invalid`,
      deleted_email: user.email,
      first_name: 'Layla',
      password_hash: null,
      anonymized_at: null,
    });
    expect(closed.deleted_at).not.toBeNull();
    expect(await memberships(user.id)).toBe(0);

    expect((await login(user.email)).statusCode).toBe(401);
    const me = await server.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);

    // The address can sign up again, as a new account
    const signup = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: user.email, password: PASSWORD },
    });
    expect(signup.statusCode).toBe(201);
    const { rows } = await app.databaseService.query<{ id: string }>(
      'SELECT id FROM public.users WHERE email = $1',
      [user.email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(user.id);
  });

  it('needs the current password, and changes nothing without it', async () => {
    const user = await member();
    const cookie = await identityCookie(user.email);

    expect((await deleteAccount(cookie, {})).statusCode).toBe(400);
    expect(
      (await deleteAccount(cookie, { password: 'Wrong123!@#' })).statusCode,
    ).toBe(400);

    expect((await row(user.id)).deleted_at).toBeNull();
    expect(await memberships(user.id)).toBe(1);
    expect((await login(user.email)).statusCode).toBe(200);
  });

  it("is refused for an organization's only active admin until another admin exists", async () => {
    const tenant = await createTestTenant(app.module, {
      name: 'Gulf Trading LLC',
    });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const cookie = await identityCookie(user.email);

    const refused = await deleteAccount(cookie, { password: PASSWORD });

    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ message: string }>().message).toContain(
      'Gulf Trading LLC',
    );
    expect((await row(user.id)).deleted_at).toBeNull();

    await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    expect(
      (await deleteAccount(cookie, { password: PASSWORD })).statusCode,
    ).toBe(200);
  });

  it('is refused for platform staff', async () => {
    const staff = await createTestUser(app.module, {
      platform_role_key: 'support',
    });
    const cookie = await identityCookie(staff.email);

    expect(
      (await deleteAccount(cookie, { password: PASSWORD })).statusCode,
    ).toBe(409);
    expect((await row(staff.id)).deleted_at).toBeNull();
  });

  it('the retention sweep anonymizes an account 30 days after its deletion, not before', async () => {
    const expired = await member();
    const recent = await member();
    for (const user of [expired, recent]) {
      const res = await deleteAccount(await identityCookie(user.email), {
        password: PASSWORD,
      });
      expect(res.statusCode).toBe(200);
    }
    const deletedDaysAgo = (user: User, days: number): Promise<unknown> =>
      app.databaseService.query(
        `UPDATE public.users SET deleted_at = now() - make_interval(days => $2) WHERE id = $1`,
        [user.id, days],
      );
    await deletedDaysAgo(expired, 31);
    await deletedDaysAgo(recent, 29);

    await app.module.get(DataRetentionSweepHandler).execute();

    const anonymized = await row(expired.id);
    expect(anonymized).toMatchObject({
      email: `deleted-${expired.id}@deleted.invalid`,
      deleted_email: null,
      first_name: null,
      last_name: null,
    });
    expect(anonymized.anonymized_at).not.toBeNull();
    expect(JSON.stringify(anonymized)).not.toContain(expired.email);

    expect(await row(recent.id)).toMatchObject({
      deleted_email: recent.email,
      first_name: 'Layla',
      anonymized_at: null,
    });
  });
});

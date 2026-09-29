import { AuditService } from '@lib/audit';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import {
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';
const CLIENT_IP = '203.0.113.9';

type Headers = Record<string, string | string[] | undefined>;

interface AuditRow {
  tenant_id: string | null;
  actor_id: string | null;
  actor_type: string;
  action: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
}

/**
 * The audit trail with the real AuditService: sign-in events (including failures and callers who
 * are not signed in), refused and failed requests, billing and platform-admin mutations; the
 * read endpoints for tenant admins and the platform; the app role can't rewrite history.
 */
describe('Audit trail', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: AuditService, useClass: AuditService }],
    });
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await app.databaseService.query('DELETE FROM public.audit_logs');
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function call(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    cookie = '',
    payload?: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> {
    return server.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie, 'x-forwarded-for': CLIENT_IP },
      ...(payload ? { payload } : {}),
    });
  }

  /** Audit writes are fire-and-forget: wait for the rows to land. */
  async function rows(action: string, expected = 1): Promise<AuditRow[]> {
    for (let i = 0; i < 40; i++) {
      const { rows: found } = await app.databaseService.query<AuditRow>(
        `SELECT tenant_id, actor_id, actor_type, action, resource_id, details, ip_address
         FROM public.audit_logs WHERE action = $1 ORDER BY created_at`,
        [action],
      );
      if (found.length >= expected) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return [];
  }

  async function signIn(email: string, tenantId?: string): Promise<string> {
    const login = await call('POST', '/auth/login', '', {
      email,
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(200);
    const identity = cookieHeaderFromSetCookie(login.headers as Headers);
    if (!tenantId) return identity;
    const switched = await call('POST', '/auth/tenant-switch', identity, {
      tenantId,
    });
    expect(switched.statusCode).toBe(200);
    return `${identity}; ${cookieHeaderFromSetCookie(switched.headers as Headers)}`;
  }

  async function tenantMember(
    role: SystemTenantRole,
    tenantId?: string,
  ): Promise<{ tenantId: string; userId: string; cookie: string }> {
    const tenant = tenantId ?? (await createTestTenant(app.module)).id;
    const { user } = await createTestUserInTenant(app.module, tenant, {
      role,
    });
    return {
      tenantId: tenant,
      userId: user.id,
      cookie: await signIn(user.email, tenant),
    };
  }

  describe('sign-in events', () => {
    it('records failed logins (with the account when there is one, a hash otherwise) and the success', async () => {
      const user = await createTestUser(app.module);

      await call('POST', '/auth/login', '', {
        email: user.email,
        password: 'Wrong123!@#',
      });
      await call('POST', '/auth/login', '', {
        email: 'nobody@test.com',
        password: PASSWORD,
      });
      await signIn(user.email);

      const logins = await rows('AUTH_LOGIN', 3);
      expect(logins).toHaveLength(3);
      const [wrong, unknown, ok] = logins;
      expect(wrong).toMatchObject({
        actor_id: user.id,
        actor_type: 'anonymous',
        ip_address: CLIENT_IP,
        details: expect.objectContaining({
          outcome: 'failure',
          reason: 'wrong_password',
        }),
      });
      expect(unknown.actor_id).toBeNull();
      expect(unknown.details).toMatchObject({
        outcome: 'failure',
        reason: 'unknown_email',
        emailHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(JSON.stringify(unknown)).not.toContain('nobody@test.com');
      expect(ok).toMatchObject({
        actor_id: user.id,
        actor_type: 'user',
        details: expect.objectContaining({ outcome: 'success' }),
      });
    });

    it('records signup, email verification, a reset request and the reset', async () => {
      const email = `new-${randomUUID().slice(0, 8)}@test.com`;
      const signup = await call('POST', '/auth/signup', '', {
        email,
        password: PASSWORD,
      });
      const { verificationToken } = signup.json<{
        verificationToken: string;
      }>();
      await call('POST', '/auth/verify-email', '', {
        token: verificationToken,
      });
      const forgot = await call('POST', '/auth/forgot-password', '', {
        email,
      });
      const { resetToken } = forgot.json<{ resetToken: string }>();
      await call('POST', '/auth/reset-password', '', {
        token: resetToken,
        newPassword: 'Changed123!@#',
      });
      await call('POST', '/auth/reset-password', '', {
        token: resetToken,
        newPassword: 'Again123!@#',
      });

      const [created] = await rows('AUTH_SIGNUP');
      expect(created.details).toMatchObject({ result: 'account_created' });
      const userId = created.actor_id;
      expect(userId).toBeTruthy();
      expect((await rows('AUTH_EMAIL_VERIFIED'))[0].actor_id).toBe(userId);
      expect(
        (await rows('AUTH_PASSWORD_RESET_REQUESTED'))[0].details,
      ).toMatchObject({ accountFound: true });
      const resets = await rows('AUTH_PASSWORD_RESET', 2);
      expect(resets.map((r) => r.details.outcome)).toEqual([
        'success',
        'failure',
      ]);
      expect(resets[0].actor_id).toBe(userId);
    });

    it('a public route with @Audit is recorded as anonymous', async () => {
      await call('POST', '/auth/resend-verification', '', {
        email: 'someone@test.com',
      });

      const [row] = await rows('AUTH_VERIFICATION_RESENT');
      expect(row).toMatchObject({
        actor_type: 'anonymous',
        actor_id: null,
        ip_address: CLIENT_IP,
      });
    });
  });

  it('records a refused permission and a failed request, not only successes', async () => {
    const member = await tenantMember(SystemTenantRole.MEMBER);
    const admin = await tenantMember(
      SystemTenantRole.TENANT_ADMIN,
      member.tenantId,
    );

    expect(
      (await call('DELETE', `/documents/${randomUUID()}`, member.cookie))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('DELETE', `/documents/${randomUUID()}`, admin.cookie))
        .statusCode,
    ).toBe(404);

    const [denied] = await rows('PERMISSION_DENIED');
    expect(denied).toMatchObject({
      tenant_id: member.tenantId,
      actor_id: member.userId,
      details: expect.objectContaining({
        required: ['documents:delete'],
        status: 403,
      }),
    });
    const [failed] = await rows('DOCUMENT_DELETED');
    expect(failed).toMatchObject({
      actor_id: admin.userId,
      details: expect.objectContaining({ outcome: 'failure', status: 404 }),
    });
  });

  it('records platform-admin mutations', async () => {
    const platformAdmin = await createTestUser(app.module, {
      platform_role_key: 'system_admin',
    });
    const cookie = await signIn(platformAdmin.email);
    const missing = randomUUID();

    expect(
      (await call('DELETE', `/authorities/${missing}`, cookie)).statusCode,
    ).toBe(404);

    const [row] = await rows('AUTHORITY_DELETED');
    expect(row).toMatchObject({
      actor_id: platformAdmin.id,
      tenant_id: null,
      resource_id: missing,
      details: expect.objectContaining({ outcome: 'failure', status: 404 }),
    });
  });

  describe('read endpoints', () => {
    it("a tenant admin reads its tenant's rows only; a member may not read them", async () => {
      const own = await tenantMember(SystemTenantRole.TENANT_ADMIN);
      const other = await tenantMember(SystemTenantRole.TENANT_ADMIN);
      const member = await tenantMember(SystemTenantRole.MEMBER, own.tenantId);
      await call('DELETE', `/documents/${randomUUID()}`, own.cookie);
      await call('DELETE', `/documents/${randomUUID()}`, other.cookie);
      await rows('DOCUMENT_DELETED', 2);

      const list = await call(
        'GET',
        '/audit-logs?action=DOCUMENT_DELETED',
        own.cookie,
      );
      expect(list.statusCode).toBe(200);
      const body = list.json<{
        data: Array<{ tenantId: string; actorId: string }>;
        meta: { total: number };
      }>();
      expect(body.meta.total).toBe(1);
      expect(body.data).toEqual([
        expect.objectContaining({
          tenantId: own.tenantId,
          actorId: own.userId,
        }),
      ]);

      expect((await call('GET', '/audit-logs', member.cookie)).statusCode).toBe(
        403,
      );
      // Not a platform view for a tenant admin
      expect(
        (await call('GET', '/admin/audit-logs', own.cookie)).statusCode,
      ).toBe(403);
    });

    it('a platform auditor reads every row, platform-level ones included, and can narrow to a tenant', async () => {
      const own = await tenantMember(SystemTenantRole.TENANT_ADMIN);
      await call('DELETE', `/documents/${randomUUID()}`, own.cookie);
      await call('POST', '/auth/login', '', {
        email: 'nobody@test.com',
        password: PASSWORD,
      });
      await rows('DOCUMENT_DELETED');
      await rows('AUTH_LOGIN', 2);
      const auditor = await createTestUser(app.module, {
        platform_role_key: 'auditor',
      });
      const cookie = await signIn(auditor.email);

      const all = await call('GET', '/admin/audit-logs?limit=100', cookie);
      expect(all.statusCode).toBe(200);
      const actions = all
        .json<{ data: Array<{ action: string; tenantId: string | null }> }>()
        .data.map((r) => r.action);
      expect(actions).toEqual(
        expect.arrayContaining(['DOCUMENT_DELETED', 'AUTH_LOGIN']),
      );

      const narrowed = await call(
        'GET',
        `/admin/audit-logs?tenantId=${own.tenantId}`,
        cookie,
      );
      expect(
        narrowed
          .json<{ data: Array<{ tenantId: string | null }> }>()
          .data.every((r) => r.tenantId === own.tenantId),
      ).toBe(true);
    });
  });

  it('the app role can add audit rows but never change or delete them', async () => {
    await expect(
      app.appDatabaseService.query('UPDATE public.audit_logs SET action = $1', [
        'x',
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      app.appDatabaseService.query('DELETE FROM public.audit_logs'),
    ).rejects.toThrow(/permission denied/);
  });
});

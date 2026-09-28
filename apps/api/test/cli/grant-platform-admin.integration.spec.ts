import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { GRANT_PLATFORM_ADMIN_COMMAND, runCli } from 'src/cli/cli';
import {
  PLATFORM_ROLE_GRANTED_AUDIT_ACTION,
  SET_PASSWORD_LINK_TTL_HOURS,
} from 'src/cli/platform-admin/platform-admin-bootstrap.service';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { AuthService } from 'src/modules/auth/auth.service';
import { SessionService } from 'src/modules/auth/services/session.service';
import { EmailService } from 'src/modules/email/email.service';
import { UserRepository } from 'src/repositories/users/user.repository';
import { createTestUser } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

describe(`CLI: ${GRANT_PLATFORM_ADMIN_COMMAND}`, () => {
  let app: TestApp;
  let server: FastifyInstance;
  let users: UserRepository;
  let sendResetEmail: jest.SpyInstance;
  let output: string[];

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    users = app.module.get(UserRepository);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    sendResetEmail = jest
      .spyOn(EmailService.prototype, 'sendPasswordResetEmail')
      .mockResolvedValue(undefined);
    output = [];
    for (const stream of ['log', 'error', 'warn'] as const) {
      jest.spyOn(console, stream).mockImplementation((...args: unknown[]) => {
        output.push(args.map(String).join(' '));
      });
    }
  }, 15000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  const grant = (...args: string[]): Promise<number> =>
    runCli([GRANT_PLATFORM_ADMIN_COMMAND, ...args]);

  async function auditRows(
    userId: string,
  ): Promise<{ actor_type: string; details: Record<string, unknown> }[]> {
    const result = await app.databaseService.query<{
      actor_type: string;
      details: Record<string, unknown>;
    }>(
      `SELECT actor_type, details FROM public.audit_logs
       WHERE action = $1 AND resource_type = 'users' AND resource_id = $2`,
      [PLATFORM_ROLE_GRANTED_AUDIT_ACTION, userId],
    );
    return result.rows;
  }

  it('creates a verified, password-less admin and emails a set-password link that works', async () => {
    const email = `new-admin-${randomUUID()}@example.com`;

    expect(await grant(email)).toBe(0);

    const created = (await users.findByEmailRow(email))!;
    expect(created).toMatchObject({
      is_verified: true,
      password_hash: null,
      platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
      auth_provider: 'email',
    });

    expect(sendResetEmail).toHaveBeenCalledTimes(1);
    const [sentTo, token] = sendResetEmail.mock.calls[0] as [string, string];
    expect(sentTo).toBe(email);
    const stored = await app.databaseService.query<{ expires_at: Date }>(
      'SELECT expires_at FROM public.password_resets WHERE user_id = $1 AND token = $2',
      [created.id, createHash('sha256').update(token).digest('hex')],
    );
    expect(stored.rows).toHaveLength(1);
    const ttlHours =
      (stored.rows[0].expires_at.getTime() - Date.now()) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(SET_PASSWORD_LINK_TTL_HOURS - 1);
    expect(ttlHours).toBeLessThanOrEqual(SET_PASSWORD_LINK_TTL_HOURS);

    expect(await auditRows(created.id)).toEqual([
      expect.objectContaining({
        actor_type: 'system',
        details: expect.objectContaining({
          role: SystemPlatformRole.SYSTEM_ADMIN,
          previousRole: null,
          accountCreated: true,
          setPasswordLinkSent: true,
          via: 'cli',
        }),
      }),
    ]);
    expect(output.join('\n')).not.toContain(token);

    // The link is the only way in: set the password, then sign in as a platform admin.
    const reset = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, newPassword: 'Bootstrap123!@#' },
    });
    expect(reset.statusCode).toBe(200);
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Bootstrap123!@#' },
    });
    expect(login.statusCode).toBe(200);
    expect(
      login.json<{ user: { platformRole: string } }>().user.platformRole,
    ).toBe(SystemPlatformRole.SYSTEM_ADMIN);
  });

  it('promotes an existing verified user and ends their sessions', async () => {
    const existing = await createTestUser(app.module);
    await app.module
      .get(AuthService)
      .login({ email: existing.email, password: 'Test123!@#' }, {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as Parameters<AuthService['login']>[1]);
    const sessions = app.module.get(SessionService);
    expect(await sessions.getIdentitySessionIds(existing.id)).toHaveLength(1);

    expect(
      await grant(existing.email, '--role', SystemPlatformRole.SUPPORT),
    ).toBe(0);

    expect((await users.findById(existing.id))?.platform_role_key).toBe(
      SystemPlatformRole.SUPPORT,
    );
    expect(await sessions.getIdentitySessionIds(existing.id)).toHaveLength(0);
    expect(sendResetEmail).not.toHaveBeenCalled();
    expect(await auditRows(existing.id)).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          role: SystemPlatformRole.SUPPORT,
          previousRole: null,
          accountCreated: false,
          setPasswordLinkSent: false,
        }),
      }),
    ]);
  });

  it('refuses an account whose email is not verified', async () => {
    const squatter = await createTestUser(app.module, { is_verified: false });

    expect(await grant(squatter.email)).toBe(1);

    expect((await users.findById(squatter.id))?.platform_role_key).toBeNull();
    expect(sendResetEmail).not.toHaveBeenCalled();
    expect(await auditRows(squatter.id)).toEqual([]);
    expect(output.join('\n')).toMatch(/Refused: .*not verified/);
  });

  it('is a no-op when the user already has the role and a password', async () => {
    const admin = await createTestUser(app.module, {
      platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
    });

    expect(await grant(admin.email)).toBe(0);

    expect(sendResetEmail).not.toHaveBeenCalled();
    expect(await auditRows(admin.id)).toEqual([]);
    expect(output.join('\n')).toContain('Role unchanged');
  });

  it.each([
    ['no email', []],
    ['an invalid email', ['not-an-email']],
    ['an unknown role', ['someone@example.com', '--role', 'tenant_admin']],
    ['an unknown option', ['someone@example.com', '--password', 'x']],
  ])('rejects %s with usage and exit code 2', async (_label, args) => {
    expect(await grant(...args)).toBe(2);
    expect(output.join('\n')).toContain('Usage:');
  });

  it('rejects an unknown command', async () => {
    expect(await runCli(['make-me-admin'])).toBe(2);
  });
});

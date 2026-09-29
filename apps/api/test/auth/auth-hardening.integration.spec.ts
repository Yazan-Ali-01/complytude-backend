import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { EmailService } from 'src/modules/email/email.service';
import { createTestUser } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';

/**
 * Signup, login and password reset over HTTP: the answers don't reveal who has an account or how
 * they sign in; email addresses are one account whatever their case; new passwords are capped at
 * bcrypt's 72 bytes; reset links are single-use and a newer one ends the older ones.
 */
describe('Auth hardening: enumeration, email case, passwords, reset tokens', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
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

  function post(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> {
    return server.inject({ method: 'POST', url: `/api/v1${url}`, payload });
  }

  async function userCount(email: string): Promise<number> {
    const { rows } = await app.databaseService.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM public.users WHERE lower(email) = lower($1)',
      [email],
    );
    return Number(rows[0].n);
  }

  /** Signs up and verifies the email, as the owner would. */
  async function registered(email: string): Promise<void> {
    const signup = await post('/auth/signup', { email, password: PASSWORD });
    expect(signup.statusCode).toBe(201);
    const { verificationToken } = signup.json<{ verificationToken: string }>();
    expect(
      (await post('/auth/verify-email', { token: verificationToken }))
        .statusCode,
    ).toBe(200);
  }

  describe('no account enumeration', () => {
    it('signup with a registered email answers like a new signup and emails the owner instead', async () => {
      const email = `taken-${randomUUID().slice(0, 8)}@test.com`;
      await registered(email);
      const notify = jest.spyOn(
        app.module.get(EmailService),
        'sendAccountExistsEmail',
      );

      const again = await post('/auth/signup', {
        email,
        password: 'Another123!@#',
      });
      const fresh = await post('/auth/signup', {
        email: `new-${randomUUID().slice(0, 8)}@test.com`,
        password: PASSWORD,
      });

      expect(again.statusCode).toBe(fresh.statusCode);
      expect(again.json<{ message: string }>().message).toBe(
        fresh.json<{ message: string }>().message,
      );
      expect(notify).toHaveBeenCalledWith(email);
      expect(await userCount(email)).toBe(1);
    });

    it('login answers the same for an unknown email, a Google-only account and a wrong password', async () => {
      const email = `known-${randomUUID().slice(0, 8)}@test.com`;
      await registered(email);
      const sso = await createTestUser(app.module, {
        email: `sso-${randomUUID().slice(0, 8)}@test.com`,
      });
      await app.databaseService.query(
        `UPDATE public.users SET password_hash = NULL, auth_provider = 'google', google_id = $2
         WHERE id = $1`,
        [sso.id, randomUUID()],
      );

      const answers = await Promise.all([
        post('/auth/login', { email: 'nobody@test.com', password: PASSWORD }),
        post('/auth/login', { email: sso.email, password: PASSWORD }),
        post('/auth/login', { email, password: 'Wrong123!@#' }),
      ]);

      expect(answers.map((a) => a.statusCode)).toEqual([401, 401, 401]);
      const messages = answers.map(
        (a) => a.json<{ message: string }>().message,
      );
      expect(new Set(messages).size).toBe(1);
      expect(messages[0]).not.toMatch(/google|microsoft|sign-in/i);
    });
  });

  describe('email case', () => {
    it('one account whatever the case: signup lower-cases, login and a second signup match it', async () => {
      const local = `Mixed.Case-${randomUUID().slice(0, 8)}`;
      await registered(`  ${local}@Test.COM `);

      const { rows } = await app.databaseService.query<{ email: string }>(
        'SELECT email FROM public.users WHERE lower(email) = lower($1)',
        [`${local}@test.com`],
      );
      expect(rows).toEqual([{ email: `${local.toLowerCase()}@test.com` }]);

      const login = await post('/auth/login', {
        email: `${local.toUpperCase()}@TEST.com`,
        password: PASSWORD,
      });
      expect(login.statusCode).toBe(200);

      await post('/auth/signup', {
        email: `${local.toLowerCase()}@test.com`,
        password: PASSWORD,
      });
      expect(await userCount(`${local}@test.com`)).toBe(1);
    });

    it('the database refuses a mixed-case email however it is written', async () => {
      await expect(
        app.databaseService.query(
          `INSERT INTO public.users (email, password_hash, is_verified) VALUES ($1, 'x', true)`,
          [`Upper-${randomUUID().slice(0, 8)}@test.com`],
        ),
      ).rejects.toThrow(/users_email_lowercase/);
    });
  });

  it('refuses a new password longer than 72 bytes (bcrypt would ignore the rest)', async () => {
    const response = await post('/auth/signup', {
      email: `long-${randomUUID().slice(0, 8)}@test.com`,
      // 40 characters, 80 bytes
      password: 'é'.repeat(40),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('72 bytes');
  });

  describe('reset tokens', () => {
    async function resetToken(email: string): Promise<string> {
      const response = await post('/auth/forgot-password', { email });
      expect(response.statusCode).toBe(200);
      return response.json<{ resetToken: string }>().resetToken;
    }

    it('a newer reset link ends the older one', async () => {
      const email = `reset-${randomUUID().slice(0, 8)}@test.com`;
      await registered(email);
      const older = await resetToken(email);
      const newer = await resetToken(email);

      expect(
        (
          await post('/auth/reset-password', {
            token: older,
            newPassword: 'Older123!@#',
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await post('/auth/reset-password', {
            token: newer,
            newPassword: 'Newer123!@#',
          })
        ).statusCode,
      ).toBe(200);
    });

    it('two resets racing with one token: exactly one succeeds', async () => {
      const email = `race-${randomUUID().slice(0, 8)}@test.com`;
      await registered(email);
      const token = await resetToken(email);

      const results = await Promise.all(
        ['First123!@#', 'Second123!@#'].map((newPassword) =>
          post('/auth/reset-password', { token, newPassword }),
        ),
      );

      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    });
  });
});

import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { createHash, randomUUID } from 'node:crypto';
import {
  IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
  IDENTITY_TOKEN_COOKIE_NAME,
} from 'src/common/swagger/common';
import { GoogleSsoStrategy } from 'src/modules/auth/strategies/google-sso.strategy';
import { MicrosoftSsoStrategy } from 'src/modules/auth/strategies/microsoft-sso.strategy';
import { UserRepository } from 'src/repositories/users/user.repository';
import { createTestUser } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import type { TestApp } from '../setup/test-app.factory';

/** SSO is enabled from env when AppModule is imported, so createTestApp is loaded after this is set. */
const SSO_ENV = {
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/v1/auth/google/callback',
  MICROSOFT_CLIENT_ID: 'test-microsoft-client-id',
  MICROSOFT_CLIENT_SECRET: 'test-microsoft-client-secret',
  MICROSOFT_CALLBACK_URL:
    'http://localhost:3001/api/v1/auth/microsoft/callback',
};

type Provider = 'google' | 'microsoft';
type StrategyContext = {
  success: (user: unknown) => void;
  error: (err: unknown) => void;
};
type ProviderStrategy = {
  validate: (...args: unknown[]) => unknown;
  authenticate: (...args: unknown[]) => void;
};

function googleProfile(
  email: string,
  verified: boolean,
  subject: string = randomUUID(),
): Record<string, unknown> {
  return {
    id: subject,
    provider: 'google',
    emails: [{ value: email, verified }],
    name: { givenName: 'Grace', familyName: 'Google' },
    _json: { email, email_verified: verified },
  };
}

function microsoftProfile(
  email: string,
  subject: string = randomUUID(),
): Record<string, unknown> {
  return {
    id: subject,
    name: { givenName: 'Mia', familyName: 'Microsoft' },
    emails: [{ value: email }],
    _json: { mail: email, userPrincipalName: email },
  };
}

function cookieValue(res: InjectResponse, name: string): string | undefined {
  return res.cookies.find((cookie) => cookie.name === name && cookie.value)
    ?.value;
}

function tokenSubject(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { sub: string };
  return payload.sub;
}

// The status code isn't asserted: the callback redirects currently go out as 200 + Location
// (Intake N-003). The Location target and the cookies are what decide the outcome.
function expectRefusedWithoutSession(res: InjectResponse): void {
  const location = new URL(String(res.headers.location));
  expect(location.searchParams.get('sso')).toBe('error');
  expect(cookieValue(res, IDENTITY_TOKEN_COOKIE_NAME)).toBeUndefined();
  expect(cookieValue(res, IDENTITY_REFRESH_TOKEN_COOKIE_NAME)).toBeUndefined();
}

/** Returns the user id the identity session was issued for. */
function expectSignedInAs(res: InjectResponse): string {
  const location = new URL(String(res.headers.location));
  expect(location.searchParams.get('sso')).toBe('success');
  const token = cookieValue(res, IDENTITY_TOKEN_COOKIE_NAME);
  expect(token).toBeDefined();
  return tokenSubject(token as string);
}

describe('SSO account linking', () => {
  const originalEnv = { ...process.env };
  let app: TestApp;
  let server: FastifyInstance;
  let users: UserRepository;
  let nextProviderProfile: unknown;

  /**
   * Replaces the provider round trip (code exchange + profile fetch) and hands `nextProviderProfile`
   * to the real strategy's validate(), so the profile mapping under test is the production one.
   */
  function stubProviderRoundTrip(strategy: ProviderStrategy): void {
    jest.spyOn(strategy, 'authenticate').mockImplementation(function (
      this: StrategyContext,
    ) {
      Promise.resolve(
        strategy.validate('access-token', 'refresh-token', nextProviderProfile),
      ).then(
        (user) => this.success(user),
        (err) => this.error(err),
      );
    });
  }

  function ssoCallback(
    provider: Provider,
    profile: Record<string, unknown>,
  ): Promise<InjectResponse> {
    nextProviderProfile = profile;
    const state = randomUUID();
    return server.inject({
      method: 'GET',
      url: `/api/v1/auth/${provider}/callback?code=test-code&state=${state}`,
      cookies: { [`sso_${provider}_state`]: state },
    });
  }

  async function verificationRecordCount(userId: string): Promise<number> {
    const result = await app.databaseService.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.email_verifications WHERE user_id = $1',
      [userId],
    );
    return Number(result.rows[0].count);
  }

  beforeAll(async () => {
    Object.assign(process.env, SSO_ENV);
    const { createTestApp } = jest.requireActual<{
      createTestApp: () => Promise<TestApp>;
    }>('../setup/test-app.factory');
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    users = app.module.get(UserRepository);
    stubProviderRoundTrip(app.module.get(GoogleSsoStrategy));
    stubProviderRoundTrip(app.module.get(MicrosoftSsoStrategy));
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
    process.env = originalEnv;
  }, 30000);

  describe('an email that matches an existing account', () => {
    it('does not give an unverified Google email the password account session', async () => {
      const victim = await createTestUser(app.module);

      const res = await ssoCallback(
        'google',
        googleProfile(victim.email, false),
      );

      expectRefusedWithoutSession(res);
      expect((await users.findById(victim.id))?.google_id).toBeNull();
    });

    it('does not give a Microsoft login the password account session (Graph mail is never verified)', async () => {
      const victim = await createTestUser(app.module);

      const res = await ssoCallback(
        'microsoft',
        microsoftProfile(victim.email),
      );

      expectRefusedWithoutSession(res);
      expect((await users.findById(victim.id))?.microsoft_id).toBeNull();
    });

    it('does not link a verified Google email into an unverified password account (pre-account hijack)', async () => {
      const squatted = await createTestUser(app.module, {
        is_verified: false,
      });

      const res = await ssoCallback(
        'google',
        googleProfile(squatted.email, true),
      );

      expectRefusedWithoutSession(res);
      expect((await users.findById(squatted.id))?.google_id).toBeNull();
    });

    it('never links into a platform-admin account', async () => {
      const admin = await createTestUser(app.module, {
        platform_role_key: 'system_admin',
      });

      const res = await ssoCallback('google', googleProfile(admin.email, true));

      expectRefusedWithoutSession(res);
      expect((await users.findById(admin.id))?.google_id).toBeNull();
    });

    it('does not replace a different Google identity already linked to the account', async () => {
      const linked = await createTestUser(app.module, {
        google_id: 'original-google-subject',
      });

      const res = await ssoCallback(
        'google',
        googleProfile(linked.email, true),
      );

      expectRefusedWithoutSession(res);
      expect((await users.findById(linked.id))?.google_id).toBe(
        'original-google-subject',
      );
    });

    it('links a verified Google email to a verified regular account and signs that account in', async () => {
      const owner = await createTestUser(app.module);
      const subject = randomUUID();

      const res = await ssoCallback(
        'google',
        googleProfile(owner.email, true, subject),
      );

      expect(expectSignedInAs(res)).toBe(owner.id);
      expect((await users.findById(owner.id))?.google_id).toBe(subject);
    });
  });

  describe('an identity already linked by provider subject', () => {
    it('signs in the linked account whatever email the provider now reports', async () => {
      const subject = randomUUID();
      const linked = await createTestUser(app.module, { google_id: subject });

      const res = await ssoCallback(
        'google',
        googleProfile(`renamed-${randomUUID()}@example.com`, false, subject),
      );

      expect(expectSignedInAs(res)).toBe(linked.id);
    });
  });

  describe('a new email', () => {
    it('creates a verified account when Google verified the email', async () => {
      const email = `new-${randomUUID()}@example.com`;

      const res = await ssoCallback('google', googleProfile(email, true));

      const created = await users.findByEmailRow(email);
      expect(created?.is_verified).toBe(true);
      expect(expectSignedInAs(res)).toBe(created?.id);
      expect(await verificationRecordCount(created!.id)).toBe(0);
    });

    it('creates an unverified account with a verification record when Google did not verify the email', async () => {
      const email = `new-${randomUUID()}@example.com`;

      await ssoCallback('google', googleProfile(email, false));

      const created = await users.findByEmailRow(email);
      expect(created?.is_verified).toBe(false);
      expect(await verificationRecordCount(created!.id)).toBe(1);
    });

    it('creates Microsoft accounts unverified, with a verification record', async () => {
      const email = `new-${randomUUID()}@example.com`;
      const subject = randomUUID();

      const res = await ssoCallback(
        'microsoft',
        microsoftProfile(email, subject),
      );

      const created = await users.findByEmailRow(email);
      expect(expectSignedInAs(res)).toBe(created?.id);
      expect(created?.is_verified).toBe(false);
      expect(created?.microsoft_id).toBe(subject);
      expect(await verificationRecordCount(created!.id)).toBe(1);
    });
  });

  describe('password signup (shares the verification-record helper)', () => {
    it('stores the sha256 of the emailed verification token', async () => {
      const email = `signup-${randomUUID()}@example.com`;

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email, password: 'Test123!@#' },
      });

      expect(res.statusCode).toBe(201);
      const { verificationToken } = res.json<{ verificationToken: string }>();
      const created = await users.findByEmailRow(email);
      expect(created?.is_verified).toBe(false);
      const stored = await app.databaseService.query<{ token: string }>(
        'SELECT token FROM public.email_verifications WHERE user_id = $1',
        [created!.id],
      );
      expect(stored.rows.map((row) => row.token)).toEqual([
        createHash('sha256').update(verificationToken).digest('hex'),
      ]);
    });
  });
});

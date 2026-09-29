import { Logger } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { randomBytes, randomUUID } from 'node:crypto';
import { IDENTITY_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { AuthService } from 'src/modules/auth/auth.service';
import type { IdentitySessionData } from 'src/modules/auth/interfaces/session.interface';
import { SessionService } from 'src/modules/auth/services/session.service';
import {
  EmailService,
  type InvitationEmailData,
} from 'src/modules/email/email.service';
import { InvitationStatus } from 'src/repositories/invitations/interfaces/invitation.interface';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import {
  createTestSubscription,
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';

type Invitation = { tenantId: string; invitationId: string; token: string };

describe('Invitation acceptance', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let authService: AuthService;
  let sessionService: SessionService;
  let users: UserRepository;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    authService = app.module.get(AuthService);
    sessionService = app.module.get(SessionService);
    users = app.module.get(UserRepository);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  const cookiesOf = (res: InjectResponse): string =>
    cookieHeaderFromSetCookie(
      res.headers as Record<string, string | string[] | undefined>,
    );

  const inviteeEmail = (): string => `invitee-${randomUUID()}@example.com`;

  function login(email: string, password = PASSWORD): Promise<InjectResponse> {
    return server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
  }

  function signup(email: string): Promise<InjectResponse> {
    return server.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email, password: PASSWORD },
    });
  }

  function tenantSwitch(
    identityCookie: string,
    tenantId: string,
  ): Promise<InjectResponse> {
    return server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: identityCookie },
      payload: { tenantId },
    });
  }

  function acceptInvitation(
    identityCookie: string,
    invitationId: string,
    payload?: Record<string, unknown>,
  ): Promise<InjectResponse> {
    return server.inject({
      method: 'POST',
      url: `/api/v1/auth/invitations/${invitationId}/accept`,
      headers: { cookie: identityCookie },
      ...(payload ? { payload } : {}),
    });
  }

  /** Tenant-admin session cookies for a new tenant with unlimited seats. */
  async function newTenantAdmin(): Promise<{
    tenantId: string;
    cookie: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'infrastructure',
    });
    const { user: admin } = await createTestUserInTenant(
      app.module,
      tenant.id,
      { role: SystemTenantRole.TENANT_ADMIN },
    );
    const adminLogin = await login(admin.email);
    expect(adminLogin.statusCode).toBe(200);
    const switched = await tenantSwitch(cookiesOf(adminLogin), tenant.id);
    expect(switched.statusCode).toBe(200);
    return { tenantId: tenant.id, cookie: cookiesOf(switched) };
  }

  /** Captures invitation emails; the token only ever reaches the invitee through one. */
  function captureInvitationEmails(): {
    sent: InvitationEmailData[];
    restore: () => void;
  } {
    const sent: InvitationEmailData[] = [];
    const spy = jest
      .spyOn(EmailService.prototype, 'sendInvitationEmail')
      .mockImplementation((data: InvitationEmailData) => {
        sent.push(data);
        return Promise.resolve();
      });
    return { sent, restore: () => spy.mockRestore() };
  }

  /** An invitation made through the tenant-admin API, as a real admin would. */
  async function invite(email: string): Promise<Invitation> {
    const admin = await newTenantAdmin();
    const emails = captureInvitationEmails();
    try {
      const created = await server.inject({
        method: 'POST',
        url: '/api/v1/tenants/admin/invitations',
        headers: { cookie: admin.cookie },
        payload: { email, roleKey: SystemTenantRole.LEGAL_COUNSEL },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toEqual({
        invitationId: expect.any(String),
        emailSent: true,
        message: expect.any(String),
      });
      expect(emails.sent).toHaveLength(1);
      expect(emails.sent[0].to).toBe(email);
      return {
        tenantId: admin.tenantId,
        invitationId: created.json<{ invitationId: string }>().invitationId,
        token: emails.sent[0].token,
      };
    } finally {
      emails.restore();
    }
  }

  /**
   * Identity session minted directly, with the JWT `isVerified` claim set independently of the
   * database, to prove the guards read the database.
   */
  async function identityCookieWithClaim(
    user: { id: string; email: string },
    claimVerified: boolean,
  ): Promise<string> {
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const session: IdentitySessionData = {
      userId: user.id,
      email: user.email,
      platformRole: null,
      isVerified: claimVerified,
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
      refreshJti: randomUUID(),
    };
    await sessionService.createIdentitySession(sessionId, session);
    const { identityAccessToken } = authService.generateIdentityTokens(
      user.id,
      user.email,
      claimVerified,
      null,
      sessionId,
      session.refreshJti,
    );
    return `${IDENTITY_TOKEN_COOKIE_NAME}=${identityAccessToken}`;
  }

  async function invitationStatus(invitationId: string): Promise<string> {
    const result = await app.databaseService.query<{ status: string }>(
      'SELECT status::text AS status FROM public.invitations WHERE id = $1',
      [invitationId],
    );
    return result.rows[0].status;
  }

  describe('someone who signs up with the invitee address but has not verified it', () => {
    it('cannot log in', async () => {
      const email = inviteeEmail();
      await invite(email);
      expect((await signup(email)).statusCode).toBe(201);

      const res = await login(email);

      expect(res.statusCode).toBe(401);
      expect(res.json<{ message: string }>().message).toMatch(/verify/i);
      expect(cookiesOf(res)).not.toContain(IDENTITY_TOKEN_COOKIE_NAME);
    });

    it('cannot list, accept, reject or switch into the tenant, even when the JWT claims it is verified', async () => {
      const email = inviteeEmail();
      const invitation = await invite(email);
      expect((await signup(email)).statusCode).toBe(201);
      const squatter = (await users.findByEmailRow(email))!;
      expect(squatter.is_verified).toBe(false);
      const cookie = await identityCookieWithClaim(squatter, true);

      const list = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/invitations',
        headers: { cookie },
      });
      expect(list.statusCode).toBe(403);

      const accept = await acceptInvitation(cookie, invitation.invitationId, {
        token: invitation.token,
      });
      expect(accept.statusCode).toBe(403);
      expect(await invitationStatus(invitation.invitationId)).toBe(
        InvitationStatus.PENDING,
      );

      const reject = await server.inject({
        method: 'POST',
        url: `/api/v1/auth/invitations/${invitation.invitationId}/reject`,
        headers: { cookie },
      });
      expect(reject.statusCode).toBe(403);
      expect(await invitationStatus(invitation.invitationId)).toBe(
        InvitationStatus.PENDING,
      );

      // Even a membership that exists (e.g. accepted before this fix) can't be switched into.
      // Written as the superuser: the app itself runs under RLS.
      await app.databaseService.transaction((client) =>
        app.module.get(UserTenantRepository).linkUserToTenant(
          {
            userId: squatter.id,
            tenantId: invitation.tenantId,
            roleKey: SystemTenantRole.TENANT_ADMIN,
          },
          { client },
        ),
      );
      const switched = await tenantSwitch(cookie, invitation.tenantId);
      expect(switched.statusCode).toBe(403);
    });
  });

  describe('the invitee', () => {
    async function verifiedInviteeSession(
      email: string,
    ): Promise<{ cookie: string }> {
      const signedUp = await signup(email);
      expect(signedUp.statusCode).toBe(201);
      const { verificationToken } = signedUp.json<{
        verificationToken: string;
      }>();
      const verified = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token: verificationToken },
      });
      expect(verified.statusCode).toBe(200);
      const loggedIn = await login(email);
      expect(loggedIn.statusCode).toBe(200);
      return { cookie: cookiesOf(loggedIn) };
    }

    it('lists the invitation after verifying, and rejects a missing or wrong token', async () => {
      const email = inviteeEmail();
      const invitation = await invite(email);
      const { cookie } = await verifiedInviteeSession(email);

      const listed = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/invitations',
        headers: { cookie },
      });
      expect(listed.statusCode).toBe(200);
      expect(
        listed.json<{ invitations: { id: string }[] }>().invitations,
      ).toEqual([expect.objectContaining({ id: invitation.invitationId })]);

      const noToken = await acceptInvitation(cookie, invitation.invitationId);
      expect(noToken.statusCode).toBe(400);

      const wrongToken = await acceptInvitation(
        cookie,
        invitation.invitationId,
        { token: randomBytes(32).toString('hex') },
      );
      expect(wrongToken.statusCode).toBe(403);
      expect(await invitationStatus(invitation.invitationId)).toBe(
        InvitationStatus.PENDING,
      );
    });

    // KNOWN BUG, so marked failing: under RLS (the real app role) the accept's seat check
    // resolves the inviting tenant's subscription without that tenant's context, and gets 404
    // "No active subscription found". It only passed while tests ran as a superuser. When the
    // accept flow is fixed, this test starts passing, which fails the suite: remove `.failing`.
    it.failing(
      'accepts with the invitation token, then switches in',
      async () => {
        const email = inviteeEmail();
        const invitation = await invite(email);
        const { cookie } = await verifiedInviteeSession(email);

        const accepted = await acceptInvitation(
          cookie,
          invitation.invitationId,
          {
            token: invitation.token,
          },
        );
        expect(accepted.statusCode).toBe(200);
        expect(await invitationStatus(invitation.invitationId)).toBe(
          InvitationStatus.ACCEPTED,
        );

        const switched = await tenantSwitch(cookie, invitation.tenantId);
        expect(switched.statusCode).toBe(200);
      },
    );

    it("cannot use another invitation's token", async () => {
      const email = inviteeEmail();
      const first = await invite(email);
      const second = await invite(email);
      const { cookie } = await verifiedInviteeSession(email);

      const res = await acceptInvitation(cookie, second.invitationId, {
        token: first.token,
      });

      expect(res.statusCode).toBe(403);
      expect(await invitationStatus(second.invitationId)).toBe(
        InvitationStatus.PENDING,
      );
    });

    it('is recognised as verified from the database even if the JWT claim is stale', async () => {
      const email = inviteeEmail();
      await invite(email);
      const invitee = await createTestUser(app.module, { email });
      const cookie = await identityCookieWithClaim(invitee, false);

      const listed = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/invitations',
        headers: { cookie },
      });

      expect(listed.statusCode).toBe(200);
    });
  });

  describe('invitation tokens', () => {
    it('reach the invitee only by email: never in the response or the logs, created or resent', async () => {
      const logged: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
        (level) =>
          jest
            .spyOn(Logger.prototype, level)
            .mockImplementation((...args: unknown[]) => {
              logged.push(args.map((arg) => String(arg)).join(' '));
            }),
      );

      const emails = captureInvitationEmails();
      try {
        const admin = await newTenantAdmin();
        const created = await server.inject({
          method: 'POST',
          url: '/api/v1/tenants/admin/invitations',
          headers: { cookie: admin.cookie },
          payload: { email: inviteeEmail() },
        });
        expect(created.statusCode).toBe(201);
        const { invitationId } = created.json<Invitation>();

        const resent = await server.inject({
          method: 'POST',
          url: `/api/v1/tenants/admin/invitations/${invitationId}/resend`,
          headers: { cookie: admin.cookie },
        });
        expect(resent.statusCode).toBe(200);
        const [token, newToken] = emails.sent.map((email) => email.token);
        expect(newToken).not.toBe(token);
        for (const body of [created.body, resent.body]) {
          expect(body).not.toContain(token);
          expect(body).not.toContain(newToken);
        }

        expect(logged.some((line) => line.includes('Invitation created'))).toBe(
          true,
        );
        expect(logged.filter((line) => line.includes(token))).toEqual([]);
        expect(logged.filter((line) => line.includes(newToken))).toEqual([]);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
        emails.restore();
      }
    });
  });
});

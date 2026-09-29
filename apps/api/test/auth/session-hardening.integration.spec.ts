import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
  TENANT_REFRESH_TOKEN_COOKIE_NAME,
} from 'src/common/swagger/common';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { SESSION_KEYS } from 'src/modules/auth/constants/session.constants';
import { SessionService } from 'src/modules/auth/services/session.service';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';

type Headers = Record<string, string | string[] | undefined>;

/**
 * Sessions against the real Redis: refresh tokens rotate and a replayed one revokes the whole
 * session; dead session ids no longer count against the per-user limit; a tenant switch ends the
 * tenant session it replaces; a tenant session never outlives its identity session.
 */
describe('Session hardening', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let sessions: SessionService;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    sessions = app.module.get(SessionService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function call(
    method: 'GET' | 'POST',
    url: string,
    cookie: string,
    payload?: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> {
    return server.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie },
      ...(payload ? { payload } : {}),
    });
  }

  /** The browser's cookies after a response: the new ones replace those it held. */
  function jar(cookie: string, response: LightMyRequestResponse): string {
    const updated = cookieHeaderFromSetCookie(response.headers as Headers);
    const merged = new Map(
      [cookie, updated]
        .flatMap((header) => header.split('; '))
        .filter(Boolean)
        .map((pair) => [pair.slice(0, pair.indexOf('=')), pair] as const),
    );
    return [...merged.values()].join('; ');
  }

  function cookieValue(cookie: string, name: string): string {
    const pair = cookie.split('; ').find((p) => p.startsWith(`${name}=`));
    return pair ? pair.slice(name.length + 1) : '';
  }

  function jtiOf(token: string): string {
    return (
      JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
      ) as { jti: string }
    ).jti;
  }

  async function signedIn(): Promise<{
    userId: string;
    tenantId: string;
    cookie: string;
  }> {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    return {
      userId: user.id,
      tenantId: tenant.id,
      cookie: cookieHeaderFromSetCookie(login.headers as Headers),
    };
  }

  async function switchedIn(): Promise<{
    userId: string;
    tenantId: string;
    cookie: string;
  }> {
    const own = await signedIn();
    const switched = await call('POST', '/auth/tenant-switch', own.cookie, {
      tenantId: own.tenantId,
    });
    expect(switched.statusCode).toBe(200);
    return { ...own, cookie: jar(own.cookie, switched) };
  }

  /**
   * Ends the window in which the refresh token just rotated away is still accepted, by dating the
   * rotation a minute back (moving the clock instead would also idle the test's 30 s sessions).
   */
  async function graceOver(userId: string, tenantId?: string): Promise<void> {
    const keys = [
      ...(await sessions.getIdentitySessionIds(userId)).map((id) =>
        SESSION_KEYS.identitySession(id),
      ),
      ...(tenantId
        ? (await sessions.getTenantSessionIds(userId, tenantId)).map((id) =>
            SESSION_KEYS.tenantSession(id),
          )
        : []),
    ];
    for (const key of keys) {
      const raw = await app.redisClient.get(key);
      if (!raw) continue;
      const session = JSON.parse(raw) as Record<string, unknown>;
      if (!session.refreshRotatedAt) continue;
      session.refreshRotatedAt = new Date(Date.now() - 60_000).toISOString();
      await app.redisClient.set(key, JSON.stringify(session), 'KEEPTTL');
    }
  }

  describe('refresh token rotation', () => {
    it('every identity refresh issues a new refresh token, and the new one works', async () => {
      const own = await signedIn();
      const first = cookieValue(own.cookie, IDENTITY_REFRESH_TOKEN_COOKIE_NAME);

      const refreshed = await call(
        'POST',
        '/auth/refresh-identity',
        own.cookie,
      );
      expect(refreshed.statusCode).toBe(200);
      const cookie = jar(own.cookie, refreshed);
      const second = cookieValue(cookie, IDENTITY_REFRESH_TOKEN_COOKIE_NAME);
      expect(jtiOf(second)).not.toBe(jtiOf(first));

      expect(
        (await call('POST', '/auth/refresh-identity', cookie)).statusCode,
      ).toBe(200);
    });

    it('a replayed identity refresh token revokes the session: the thief and the owner are both out', async () => {
      const own = await signedIn();
      const stolen = own.cookie;
      const rotated = jar(
        own.cookie,
        await call('POST', '/auth/refresh-identity', own.cookie),
      );

      await graceOver(own.userId);
      expect(
        (await call('POST', '/auth/refresh-identity', stolen)).statusCode,
      ).toBe(401);

      expect(
        (await call('POST', '/auth/refresh-identity', rotated)).statusCode,
      ).toBe(401);
      expect(
        (await call('GET', '/auth/sessions/all', rotated)).statusCode,
      ).toBe(401);
      expect(await sessions.getIdentitySessionIds(own.userId)).toEqual([]);
    });

    it('two refreshes at once (two tabs) both succeed and end on the same refresh token', async () => {
      const own = await signedIn();

      const [a, b] = await Promise.all([
        call('POST', '/auth/refresh-identity', own.cookie),
        call('POST', '/auth/refresh-identity', own.cookie),
      ]);

      expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
      const jtiA = jtiOf(
        cookieValue(jar('', a), IDENTITY_REFRESH_TOKEN_COOKIE_NAME),
      );
      const jtiB = jtiOf(
        cookieValue(jar('', b), IDENTITY_REFRESH_TOKEN_COOKIE_NAME),
      );
      expect(jtiA).toBe(jtiB);
      // Whichever response the browser kept, it can refresh later
      await graceOver(own.userId);
      expect(
        (await call('POST', '/auth/refresh-identity', jar(own.cookie, a)))
          .statusCode,
      ).toBe(200);
    });

    it('a replayed tenant refresh token revokes the tenant session and its identity session', async () => {
      const own = await switchedIn();
      const first = cookieValue(own.cookie, TENANT_REFRESH_TOKEN_COOKIE_NAME);

      const refreshed = await call('POST', '/auth/refresh-tenant', own.cookie);
      expect(refreshed.statusCode).toBe(200);
      const rotated = jar(own.cookie, refreshed);
      expect(
        jtiOf(cookieValue(rotated, TENANT_REFRESH_TOKEN_COOKIE_NAME)),
      ).not.toBe(jtiOf(first));

      await graceOver(own.userId, own.tenantId);
      expect(
        (await call('POST', '/auth/refresh-tenant', own.cookie)).statusCode,
      ).toBe(401);
      expect((await call('GET', '/documents', rotated)).statusCode).toBe(401);
      expect(
        (await call('GET', '/auth/sessions/all', rotated)).statusCode,
      ).toBe(401);
    });
  });

  it('dead session ids no longer count: with 4 of them, two logins keep both sessions', async () => {
    const own = await signedIn();
    const [first] = await sessions.getIdentitySessionIds(own.userId);
    // Ids whose sessions expired by TTL, as a user who never logs out accumulates
    await app.redisClient.sadd(
      SESSION_KEYS.userIdentitySessions(own.userId),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    );

    const email = (
      await app.databaseService.query<{ email: string }>(
        'SELECT email FROM public.users WHERE id = $1',
        [own.userId],
      )
    ).rows[0].email;
    for (let i = 0; i < 2; i++) {
      const login = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: PASSWORD },
      });
      expect(login.statusCode).toBe(200);
    }

    const ids = await sessions.getIdentitySessionIds(own.userId);
    expect(ids).toHaveLength(3);
    expect(ids).toContain(first);
    expect(await sessions.identitySessionExistsPure(first)).toBe(true);
    // The index no longer lives forever
    expect(
      await app.redisClient.ttl(SESSION_KEYS.userIdentitySessions(own.userId)),
    ).toBeGreaterThan(0);
  });

  it('a tenant switch ends the tenant session it replaces', async () => {
    const own = await switchedIn();
    const again = await call('POST', '/auth/tenant-switch', own.cookie, {
      tenantId: own.tenantId,
    });
    expect(again.statusCode).toBe(200);

    // The first tenant cookie no longer works, the second does
    expect((await call('GET', '/documents', own.cookie)).statusCode).toBe(401);
    expect(
      (await call('GET', '/documents', jar(own.cookie, again))).statusCode,
    ).toBe(200);
    expect(
      await sessions.getTenantSessionIds(own.userId, own.tenantId),
    ).toHaveLength(1);
  });

  it('a tenant session missing from its identity session is still ended by logging out', async () => {
    const own = await switchedIn();
    const [identityId] = await sessions.getIdentitySessionIds(own.userId);
    // As a lost update used to leave it: the identity session no longer lists its tenant session
    const key = SESSION_KEYS.identitySession(identityId);
    const stored = JSON.parse((await app.redisClient.get(key))!) as Record<
      string,
      unknown
    >;
    await app.redisClient.set(
      key,
      JSON.stringify({ ...stored, activeTenantSessionIds: [] }),
      'KEEPTTL',
    );
    expect((await call('GET', '/documents', own.cookie)).statusCode).toBe(200);

    await sessions.deleteIdentitySession(identityId, own.userId);

    expect((await call('GET', '/documents', own.cookie)).statusCode).toBe(401);
    expect(
      (await call('POST', '/auth/refresh-tenant', own.cookie)).statusCode,
    ).toBe(401);
  });

  it('updates to a session keep each other and never recreate a deleted session', async () => {
    const own = await switchedIn();
    const [identityId] = await sessions.getIdentitySessionIds(own.userId);
    const [tenantSessionId] = await sessions.getTenantSessionIds(
      own.userId,
      own.tenantId,
    );

    await Promise.all([
      sessions.updateIdentitySessionName(identityId, own.userId, 'Laptop'),
      sessions.updateIdentitySessionGeo(identityId, own.userId, {
        country: 'United Arab Emirates',
        city: 'Dubai',
        countryCode: 'AE',
      }),
    ]);
    const updated = await sessions.findIdentitySessionById(identityId);
    expect(updated).toMatchObject({
      sessionName: 'Laptop',
      geoLocation: { city: 'Dubai' },
      activeTenantSessionIds: [tenantSessionId],
    });

    await sessions.deleteIdentitySession(identityId, own.userId);
    expect(
      await sessions.updateIdentitySessionName(identityId, own.userId, 'x'),
    ).toBe(false);
    expect(
      await app.redisClient.exists(SESSION_KEYS.identitySession(identityId)),
    ).toBe(0);
  });
});

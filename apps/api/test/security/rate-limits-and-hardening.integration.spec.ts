import type {
  FastifyInstance,
  InjectOptions,
  LightMyRequestResponse,
} from 'fastify';
import Stripe from 'stripe';
import { RateLimitService } from 'src/common/rate-limit/rate-limit.service';
import { createTestUser } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';

/**
 * Over HTTP: per-IP and per-email limits on the auth routes, the per-account login lockout,
 * security headers on responses, and the Stripe webhook's capped raw-body capture.
 */
describe('Rate limits, login lockout and HTTP hardening', () => {
  let app: TestApp;
  let fastify: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    fastify = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    // Off for the rest of the suite (it logs in many times); this suite tests it
    app.module.get(RateLimitService).enabled = true;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function send(options: InjectOptions): Promise<LightMyRequestResponse> {
    return fastify.inject(options);
  }

  function login(
    email: string,
    password: string,
  ): Promise<LightMyRequestResponse> {
    return send({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
  }

  async function lockKey(): Promise<string> {
    // Returned keys carry the client's key prefix, which commands add again
    const prefix = process.env.REDIS_KEY_PREFIX ?? '';
    const keys = await app.redisClient.keys('*account_locked:*');
    const lock = keys.find((key) => !key.endsWith(':level'));
    if (!lock) throw new Error('no lock');
    return lock.slice(prefix.length);
  }

  it('refuses a flood of logins from one IP with 429 and Retry-After', async () => {
    // Limits count per fixed one-minute window: pin the clock mid-window, so a slow run can't
    // spread the requests over two windows
    const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(minuteStart + 20_000);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      // A different unknown email each time: only the per-IP limit applies
      statuses.push((await login(`nobody-${i}@test.com`, 'wrong')).statusCode);
    }

    expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true);
    const refused = await login('nobody-last@test.com', 'wrong');
    clock.mockRestore();
    expect(refused.statusCode).toBe(429);
    expect(Number(refused.headers['retry-after'])).toBe(40);
    // Every login costs a bcrypt, even for an unknown email (so timing reveals nothing): 22 of them
  }, 30000);

  it('locks an account after five wrong passwords, then lets it in once the lock expires', async () => {
    const victim = await createTestUser(app.module);
    const bystander = await createTestUser(app.module);

    for (let i = 0; i < 5; i++) {
      expect((await login(victim.email, 'wrong-password')).statusCode).toBe(
        401,
      );
    }

    // The right password is refused while locked, before it is checked
    const locked = await login(victim.email, PASSWORD);
    expect(locked.statusCode).toBe(429);
    expect(
      locked.json<{ retryAfterSeconds: number }>().retryAfterSeconds,
    ).toBeGreaterThan(14 * 60);
    // The lock is per account: others sign in as normal
    expect((await login(bystander.email, PASSWORD)).statusCode).toBe(200);

    await app.redisClient.del(await lockKey());
    expect((await login(victim.email, PASSWORD)).statusCode).toBe(200);
  });

  it('doubles the lock for an account locked again the same day', async () => {
    const victim = await createTestUser(app.module);
    for (let i = 0; i < 5; i++) await login(victim.email, 'wrong-password');
    await app.redisClient.del(await lockKey());

    for (let i = 0; i < 5; i++) await login(victim.email, 'wrong-password');

    const ttl = await app.redisClient.ttl(await lockKey());
    expect(ttl).toBeGreaterThan(29 * 60);
    expect(ttl).toBeLessThanOrEqual(30 * 60);
  });

  it('a successful login clears earlier failures', async () => {
    const user = await createTestUser(app.module);
    for (let i = 0; i < 4; i++) await login(user.email, 'wrong-password');
    expect((await login(user.email, PASSWORD)).statusCode).toBe(200);

    for (let i = 0; i < 4; i++) await login(user.email, 'wrong-password');
    expect((await login(user.email, PASSWORD)).statusCode).toBe(200);
  });

  it('limits password-reset emails per address, whatever the IP', async () => {
    const user = await createTestUser(app.module);
    const forgot = (
      email: string,
      ip: string,
    ): Promise<LightMyRequestResponse> =>
      send({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email },
        remoteAddress: ip,
      });

    for (let i = 0; i < 3; i++) {
      expect((await forgot(user.email, `10.0.0.${i}`)).statusCode).toBe(200);
    }
    expect(
      (await forgot(user.email.toUpperCase(), '10.0.0.9')).statusCode,
    ).toBe(429);
    expect((await forgot('someone-else@test.com', '10.0.0.9')).statusCode).toBe(
      200,
    );
  });

  it('sends security headers on every response', async () => {
    const response = await send({ method: 'GET', url: '/api/health' });

    expect(response.headers).toMatchObject({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
  });

  describe('Stripe webhook body', () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

    function webhook(
      url: string,
      payload: string,
    ): Promise<LightMyRequestResponse> {
      return send({
        method: 'POST',
        url,
        payload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': Stripe.webhooks.generateTestHeaderString({
            payload,
            secret,
          }),
        },
      });
    }

    it('verifies a signed event from its raw bytes', async () => {
      jest
        .spyOn(app.queueProducerService, 'enqueue')
        .mockResolvedValue({} as never);
      const payload = JSON.stringify({
        id: 'evt_hardening_1',
        object: 'event',
        type: 'customer.created',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'cus_1' } },
      });

      const response = await webhook(
        '/api/v1/stripe/webhook?source=test',
        payload,
      );

      expect(response.statusCode).toBe(200);
      jest.restoreAllMocks();
    });

    it('refuses an oversized body with 413', async () => {
      const payload = JSON.stringify({ padding: 'x'.repeat(1024 * 1024 + 1) });

      expect(
        (await webhook('/api/v1/stripe/webhook', payload)).statusCode,
      ).toBe(413);
    });

    it('treats a route that only mentions the webhook path as an ordinary request', async () => {
      const payload = JSON.stringify({ email: 'a@test.com', password: 'x' });

      const response = await webhook(
        '/api/v1/auth/login?next=/stripe/webhook',
        payload,
      );

      // Reaches login as an ordinary request
      expect(response.statusCode).toBe(401);
    });
  });
});

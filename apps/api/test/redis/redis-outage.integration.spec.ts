import { QueueModule } from '@lib/queue';
import { RedisModule } from '@lib/redis';
// A bare queue and worker on a connection to the flaky proxy, outside Nest
// eslint-disable-next-line no-restricted-imports
import { Queue, Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createServer, Server, Socket } from 'node:net';
import { SessionService } from 'src/modules/auth/services/session.service';
import { createTestUser } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/** Longer than the old retry budget (3 attempts, ~600 ms), after which a client gave up for good. */
const OUTAGE_MS = 2500;

/** A TCP hop in front of the test Redis that can drop every connection and refuse new ones. */
class FlakyProxy {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  port = 0;

  constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
  ) {}

  async up(): Promise<void> {
    const server = createServer((client) => {
      const upstream = new Socket();
      upstream.connect(this.targetPort, this.targetHost);
      for (const socket of [client, upstream]) {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        socket.on('error', () => socket.destroy());
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((resolve) => server.listen(this.port, resolve));
    this.port = (server.address() as { port: number }).port;
    this.server = server;
  }

  async down(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
    this.server = null;
  }
}

async function eventually<T>(
  probe: () => Promise<T>,
  timeoutMs = 20000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await probe();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/**
 * Redis going away and coming back: the cache/session client and BullMQ reconnect by themselves
 * (no restart), and while the session store can't be asked, requests are refused with 503
 * instead of being accepted on the JWT alone.
 */
describe('Redis outage', () => {
  let app: TestApp;
  let proxy: FlakyProxy;
  const db = Number(process.env.REDIS_DB);

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    proxy = new FlakyProxy(
      process.env.REDIS_HOST!,
      Number(process.env.REDIS_PORT),
    );
    await proxy.up();
  }, 15000);

  afterEach(async () => {
    await proxy.down();
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function outage(): Promise<void> {
    await proxy.down();
    await new Promise((resolve) => setTimeout(resolve, OUTAGE_MS));
    await proxy.up();
  }

  it('the cache and session client reconnects on its own after an outage', async () => {
    const client: Redis = RedisModule.createClient({
      host: '127.0.0.1',
      port: proxy.port,
      db,
      keyPrefix: `outage-${randomUUID()}:`,
      maxRetriesPerRequest: 3,
      retryDelayMs: 100,
      connectTimeout: 10000,
    });
    try {
      await client.set('before', '1');

      await outage();

      expect(await eventually(() => client.get('before'))).toBe('1');
      expect(client.status).toBe('ready');
    } finally {
      client.disconnect();
    }
  }, 40000);

  it('BullMQ reconnects on its own and processes a job enqueued after the outage', async () => {
    const name = `outage-${randomUUID()}`;
    const config = { host: '127.0.0.1', port: proxy.port, db };
    // BullMQ leaves connections it was given open: the test closes them
    const queueConnection = QueueModule.createConnection(config);
    const workerConnection = QueueModule.createConnection(config);
    const queue = new Queue(name, { connection: queueConnection });
    const processed: string[] = [];
    const worker = new Worker(
      name,
      (job) => {
        processed.push(job.name);
        return Promise.resolve();
      },
      { connection: workerConnection },
    );
    worker.on('error', () => undefined);
    queue.on('error', () => undefined);
    try {
      await queue.add('before', {});
      await eventually(() =>
        processed.includes('before')
          ? Promise.resolve()
          : Promise.reject(new Error('not yet')),
      );

      await outage();

      await eventually(() => queue.add('after', {}));
      await eventually(() =>
        processed.includes('after')
          ? Promise.resolve()
          : Promise.reject(new Error('not yet')),
      );
      expect(processed).toEqual(['before', 'after']);
    } finally {
      await worker.close(true);
      await queue.close();
      queueConnection.disconnect();
      workerConnection.disconnect();
    }
  }, 60000);

  it('refuses a signed-in request with 503 while the session store is unreachable', async () => {
    const fastify = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    const user = await createTestUser(app.module);
    const signedIn = await fastify.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    const cookie = cookieHeaderFromSetCookie(
      signedIn.headers as Record<string, string | string[] | undefined>,
    );
    const me = () =>
      fastify.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { cookie },
      });
    expect((await me()).statusCode).toBe(200);

    const sessions = app.module.get(SessionService);
    const down = jest
      .spyOn(sessions, 'identitySessionExistsPure')
      .mockRejectedValue(new Error('Connection is closed.'));
    const refresh = jest
      .spyOn(sessions, 'identitySessionExists')
      .mockRejectedValue(new Error('Connection is closed.'));
    try {
      expect((await me()).statusCode).toBe(503);
      const refreshed = await fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh-identity',
        headers: { cookie },
      });
      expect(refreshed.statusCode).toBe(503);
    } finally {
      down.mockRestore();
      refresh.mockRestore();
    }

    expect((await me()).statusCode).toBe(200);
  });
});

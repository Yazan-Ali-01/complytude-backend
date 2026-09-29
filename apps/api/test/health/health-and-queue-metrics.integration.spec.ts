import { DatabaseService } from '@lib/database';
import {
  getQueueToken,
  QUEUE_NAMES,
  QueueModule,
  type Queue,
} from '@lib/queue';
import { RedisHealthIndicator } from '@lib/redis/redis.health';
// A bare worker that fails jobs on purpose, outside Nest
// eslint-disable-next-line no-restricted-imports
import { Worker } from 'bullmq';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { QueueMetricsHandler } from 'src/modules/tenant-processing/handlers/queue-metrics.handler';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Liveness stays up; readiness reports each dependency as up or down (503 when any is down,
 * never with the error text); and the queue-metrics job measures every queue's backlog, oldest
 * waiting job and recent failures, which the CloudWatch alarms read from its log lines.
 */
describe('Health checks and queue metrics', () => {
  let app: TestApp;
  let fastify: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    fastify = app.app.getHttpAdapter().getInstance() as FastifyInstance;
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

  const get = (url: string): Promise<LightMyRequestResponse> =>
    fastify.inject({ method: 'GET', url });

  describe('health', () => {
    it('is ready when the database, Redis and the queues answer', async () => {
      const response = await get('/api/health/ready');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        checks: { database: 'up', redis: 'up', queues: 'up' },
      });
    });

    it('is not ready (503) when Redis is down, without revealing why, while liveness stays up', async () => {
      jest
        .spyOn(app.module.get(RedisHealthIndicator), 'isHealthy')
        .mockRejectedValue(
          new Error(
            'WRONGPASS invalid username-password pair for redis.internal',
          ),
        );

      const ready = await get('/api/health/ready');

      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toMatchObject({
        status: 'unavailable',
        checks: { database: 'up', redis: 'down', queues: 'up' },
      });
      expect(ready.body).not.toMatch(/WRONGPASS|redis\.internal/);
      expect((await get('/api/health')).statusCode).toBe(200);
    });

    it('is not ready when the database is down or too slow to answer', async () => {
      const database = app.module.get(DatabaseService);
      jest
        .spyOn(database, 'query')
        .mockRejectedValueOnce(
          new Error('password authentication failed for user "app_login"'),
        );
      const failing = await get('/api/health/ready');
      expect(failing.statusCode).toBe(503);
      expect(failing.body).not.toContain('password authentication');
      expect(failing.json()).toMatchObject({ checks: { database: 'down' } });

      jest
        .spyOn(database, 'query')
        .mockImplementationOnce(() => new Promise(() => undefined));
      const started = Date.now();
      const hanging = await get('/api/health/ready');
      expect(hanging.statusCode).toBe(503);
      expect(Date.now() - started).toBeLessThan(5000);
    });

    it('no longer serves the public detail endpoints', async () => {
      for (const path of ['db', 'redis', 'queues']) {
        expect((await get(`/api/health/${path}`)).statusCode).toBe(404);
      }
    });
  });

  describe('queue metrics', () => {
    const queue = (name: string): Queue =>
      app.module.get<Queue>(getQueueToken(name), { strict: false });

    it('reports every queue, with backlog, oldest waiting job and failures of the last minute', async () => {
      // Nothing in the API consumes ai-processing: these jobs wait
      const ai = queue(QUEUE_NAMES.AI_PROCESSING);
      await ai.add('old', {}, { timestamp: Date.now() - 600_000 });
      await ai.add('new', {});

      // A job that failed just now
      const generation = queue(QUEUE_NAMES.DOCUMENT_GENERATION);
      const connection = QueueModule.createConnection({
        host: process.env.REDIS_HOST!,
        port: Number(process.env.REDIS_PORT),
        db: Number(process.env.REDIS_QUEUE_DB),
      });
      const worker = new Worker(
        QUEUE_NAMES.DOCUMENT_GENERATION,
        () => Promise.reject(new Error('boom')),
        { connection, prefix: generation.opts.prefix },
      );
      try {
        const failed = new Promise((resolve) => worker.once('failed', resolve));
        await generation.add('bad', {}, { attempts: 1 });
        await failed;
      } finally {
        await worker.close();
        connection.disconnect();
      }

      const metrics = await app.module.get(QueueMetricsHandler).execute();

      expect(metrics.map((m) => m.queue).sort()).toEqual(
        Object.values(QUEUE_NAMES).sort(),
      );
      const aiMetrics = metrics.find(
        (m) => m.queue === QUEUE_NAMES.AI_PROCESSING,
      )!;
      expect(aiMetrics).toMatchObject({ metric: 'queue_depth', waiting: 2 });
      expect(aiMetrics.oldestWaitingSeconds).toBeGreaterThanOrEqual(599);
      expect(
        metrics.find((m) => m.queue === QUEUE_NAMES.DOCUMENT_GENERATION),
      ).toMatchObject({ failedLastInterval: 1, waiting: 0 });
      expect(
        metrics.find((m) => m.queue === QUEUE_NAMES.DATA_INGESTION),
      ).toMatchObject({
        waiting: 0,
        oldestWaitingSeconds: 0,
        failedLastInterval: 0,
      });
    });
  });
});

import { getQueueToken } from '@nestjs/bullmq';
import { AI_JOB_NAMES, QUEUE_NAMES } from '@lib/queue';
import type { Queue } from 'bullmq';
import { createTestApp } from './test-app.factory';
import { resetTestState } from '../helpers/redis-flush.helper';

describe('Smoke Test - Test Infrastructure', () => {
  const testApp = createTestApp();
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await testApp;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  });

  it('DB connection works', async () => {
    const result = await app.databaseService.query<{ ok: number }>(
      'SELECT 1 as ok',
      [],
      true,
    );
    expect(result.rows[0]?.ok).toBe(1);
  });

  it('migrations ran (tenants table exists)', async () => {
    const result = await app.databaseService.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'
      ) as exists`,
      [],
      true,
    );
    expect(result.rows[0]?.exists).toBe(true);
  });

  it('truncate works', async () => {
    await app.databaseService.query(
      `INSERT INTO public.tenants (name, plan) VALUES ('smoke-test-tenant', 'navigator')`,
      [],
      true,
    );
    const before = await app.databaseService.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM public.tenants WHERE name = $1',
      ['smoke-test-tenant'],
      true,
    );
    expect(before.rows[0]?.count).toBe('1');

    await resetTestState(app.databaseService, app.redisClient);

    const after = await app.databaseService.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM public.tenants',
      [],
      true,
    );
    expect(after.rows[0]?.count).toBe('0');
  });

  it('reference tables survive truncation', async () => {
    await resetTestState(app.databaseService, app.redisClient);
    const result = await app.databaseService.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM public.plans',
      [],
      true,
    );
    expect(parseInt(result.rows[0]?.count ?? '0', 10)).toBeGreaterThan(0);
  });

  it('DatabaseService methods work', async () => {
    const queryResult = await app.databaseService.query<{ n: number }>(
      'SELECT 42 as n',
      [],
      true,
    );
    expect(queryResult.rows[0]?.n).toBe(42);

    const txResult = await app.databaseService.transaction(async (client) => {
      const r = await client.query<{ n: number }>('SELECT 99 as n');
      return r.rows[0]?.n ?? 0;
    }, true);
    expect(txResult).toBe(99);

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const tenantTxResult = await app.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        const r = await client.query<{ n: number }>('SELECT 123 as n');
        return r.rows[0]?.n ?? 0;
      },
    );
    expect(tenantTxResult).toBe(123);
  });

  it('Redis connection works', async () => {
    await app.redisClient.set('smoke:test-key', 'smoke-value');
    const value = await app.redisClient.get('smoke:test-key');
    expect(value).toBe('smoke-value');
  });

  it('Redis flush works', async () => {
    await app.redisClient.set('smoke:flush-test', 'before-flush');
    await resetTestState(app.databaseService, app.redisClient);
    const value = await app.redisClient.get('smoke:flush-test');
    expect(value).toBeNull();
  });

  it('BullMQ works', async () => {
    const queue = app.module.get<Queue>(
      getQueueToken(QUEUE_NAMES.AI_PROCESSING),
    );
    await app.queueProducerService.enqueue(
      QUEUE_NAMES.AI_PROCESSING,
      AI_JOB_NAMES.DOCUMENT_GENERATION,
      {
        tenantId: '00000000-0000-0000-0000-000000000001',
        templateVersionId: '00000000-0000-0000-0000-000000000002',
        variables: {},
        userId: '00000000-0000-0000-0000-000000000003',
        documentId: '00000000-0000-0000-0000-000000000004',
      },
    );
    const counts = await queue.getJobCounts();
    expect(counts.waiting + counts.active + counts.delayed).toBeGreaterThan(0);
  });

  it('BullMQ jobs cleared by flush', async () => {
    await app.queueProducerService.enqueue(
      QUEUE_NAMES.AI_PROCESSING,
      AI_JOB_NAMES.DOCUMENT_GENERATION,
      {
        tenantId: '00000000-0000-0000-0000-000000000001',
        templateVersionId: '00000000-0000-0000-0000-000000000002',
        variables: {},
        userId: '00000000-0000-0000-0000-000000000003',
        documentId: '00000000-0000-0000-0000-000000000004',
      },
    );
    const queue = app.module.get<Queue>(
      getQueueToken(QUEUE_NAMES.AI_PROCESSING),
    );
    const beforeCounts = await queue.getJobCounts();
    expect(beforeCounts.waiting + beforeCounts.active).toBeGreaterThan(0);

    await resetTestState(app.databaseService, app.redisClient);

    const afterCounts = await queue.getJobCounts();
    expect(afterCounts.waiting).toBe(0);
    expect(afterCounts.active).toBe(0);
  });
});

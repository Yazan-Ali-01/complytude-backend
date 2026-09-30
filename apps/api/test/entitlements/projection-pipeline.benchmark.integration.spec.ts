/**
 * COM-136: Latency benchmark — sync vs async projection path under concurrent load.
 *
 * Measures p50/p95/p99 for 50 concurrent checkAndRecord() calls:
 * - Sync (strict mode, every limited feature since T-14): ledger + projection update in one
 *   transaction → row lock contention
 * - Async (unlimited features): ledger + enqueue only → projection via BullMQ worker
 *
 * Run: pnpm test:benchmark
 * Expected: ~30–50% improvement in p95/p99 for async path.
 */
import type { Queue } from '@lib/queue';
import { getQueueToken, QUEUE_NAMES } from '@lib/queue';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { createTestSubscription, createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const CONCURRENT_CALLS = 50;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runBenchmark(
  app: TestApp,
  label: string,
  planKey: 'general_counsel' | 'infrastructure',
): Promise<{ p50: number; p95: number; p99: number; latencies: number[] }> {
  const enforcementService = app.module.get(EntitlementEnforcementService);
  const tenant = await createTestTenant(app.module);
  // General Counsel: 100 documents (limited, strict); Infrastructure: unlimited (async)
  await createTestSubscription(app.module, tenant.id, { planKey });

  const latencies: number[] = [];
  const startAll = performance.now();

  const results = await Promise.all(
    Array.from({ length: CONCURRENT_CALLS }, async () => {
      const start = performance.now();
      const result = await enforcementService.checkAndRecord({
        tenantId: tenant.id,
        featureKey: 'documents_per_month',
        units: 1,
      });
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      return result;
    }),
  );

  const totalMs = performance.now() - startAll;
  const allowed = results.filter((r) => r.allowed).length;

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  console.log(
    `[${label}] total=${totalMs.toFixed(0)}ms allowed=${allowed}/${CONCURRENT_CALLS} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms`,
  );

  return { p50, p95, p99, latencies };
}

describe('Projection Pipeline Benchmark', () => {
  let app: TestApp;
  let queue: Queue;

  beforeAll(async () => {
    app = await createTestApp();
    queue = app.module.get<Queue>(
      getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING),
    );
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  it('p50/p95/p99 latency: sync (strict) vs async under 50 concurrent calls', async () => {
    const syncResult = await runBenchmark(
      app,
      'sync (strict)',
      'general_counsel',
    );
    expect(syncResult.latencies).toHaveLength(CONCURRENT_CALLS);
    expect(syncResult.p50).toBeGreaterThan(0);

    await resetTestState(app.databaseService, app.redisClient);
    const asyncResult = await runBenchmark(app, 'async', 'infrastructure');
    expect(asyncResult.latencies).toHaveLength(CONCURRENT_CALLS);
    expect(asyncResult.p50).toBeGreaterThan(0);

    await waitForQueueIdle(queue, 30000);

    const p95Improvement =
      ((syncResult.p95 - asyncResult.p95) / syncResult.p95) * 100;
    const p99Improvement =
      ((syncResult.p99 - asyncResult.p99) / syncResult.p99) * 100;

    console.log(
      `\n--- Benchmark Summary (COM-136) ---\n` +
        `Sync (strict):  p50=${syncResult.p50.toFixed(1)}ms p95=${syncResult.p95.toFixed(1)}ms p99=${syncResult.p99.toFixed(1)}ms\n` +
        `Async:          p50=${asyncResult.p50.toFixed(1)}ms p95=${asyncResult.p95.toFixed(1)}ms p99=${asyncResult.p99.toFixed(1)}ms\n` +
        `Improvement:    p95 ${p95Improvement >= 0 ? '+' : ''}${p95Improvement.toFixed(1)}%  p99 ${p99Improvement >= 0 ? '+' : ''}${p99Improvement.toFixed(1)}%\n`,
    );
  }, 120000);
});

import type { QueryOptions } from '@lib/database';
import type { Queue } from '@lib/queue';
import {
  ENTITLEMENT_JOB_NAMES,
  EntitlementProjectionUpdateJobData,
  getQueueToken,
  QUEUE_NAMES,
  RetryableError,
} from '@lib/queue';
import type { IncrementUsageInput } from 'src/common/types/entitlement.types';
import { deriveBillingPeriod } from 'src/common/utils/billing.util';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { ProjectionReconciliationService } from 'src/modules/entitlements/services/projection-reconciliation.service';
import { UsageIngestionService } from 'src/modules/entitlements/services/usage-ingestion.service';
import { UsageProjectionService } from 'src/modules/entitlements/services/usage-projection.service';
import { buildUsageRecordedEvent } from 'src/modules/entitlements/utils/usage-event-payload.util';
import { FeaturesRepository } from 'src/repositories/features/features.repository';
import { AggregatedUsageRepository } from 'src/repositories/usage/aggregated-usage.repository';
import { UsageLedgerRepository } from 'src/repositories/usage/usage-ledger.repository';
import { createTestSubscription, createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { withTenantContext } from '../helpers/tenant-context.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Query aggregated_usage for a specific tenant+subscription+feature within
 * tenant RLS context. Returns null if no row exists. */
async function getAggregatedUsage(
  app: TestApp,
  tenantId: string,
  subscriptionId: string,
  featureId: string,
) {
  return withTenantContext(app.databaseService, tenantId, async (client) => {
    const result = await client.query(
      `SELECT total_units, plan_units, addon_units, credit_units, override_units
         FROM public.aggregated_usage
         WHERE tenant_id = $1 AND subscription_id = $2 AND feature_id = $3`,
      [tenantId, subscriptionId, featureId],
    );
    return result.rows[0] ?? null;
  });
}

/** Query domain_events for a specific tenant+event_type within tenant context. */
async function getDomainEvents(
  app: TestApp,
  tenantId: string,
  eventType: string,
) {
  return withTenantContext(app.databaseService, tenantId, async (client) => {
    const result = await client.query(
      `SELECT id, event_type, aggregate_id, payload, metadata
         FROM public.domain_events
         WHERE tenant_id = $1 AND event_type = $2
         ORDER BY recorded_at ASC`,
      [tenantId, eventType],
    );
    return result.rows;
  });
}

/** Count usage_ledger rows for a tenant+feature within tenant context. */
async function countLedgerRows(
  app: TestApp,
  tenantId: string,
  featureId: string,
) {
  return withTenantContext(app.databaseService, tenantId, async (client) => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM public.usage_ledger
         WHERE tenant_id = $1 AND feature_id = $2`,
      [tenantId, featureId],
    );
    return result.rows[0].cnt as number;
  });
}

/** Count usage_allocations rows for a tenant+feature within tenant context. */
async function countAllocationRows(
  app: TestApp,
  tenantId: string,
  featureId: string,
) {
  return withTenantContext(app.databaseService, tenantId, async (client) => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM public.usage_allocations ua
         JOIN public.usage_ledger ul ON ul.id = ua.usage_ledger_id
         WHERE ul.tenant_id = $1 AND ul.feature_id = $2`,
      [tenantId, featureId],
    );
    return result.rows[0].cnt as number;
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Projection Pipeline', () => {
  let app: TestApp;
  let enforcementService: EntitlementEnforcementService;
  let reconciliationService: ProjectionReconciliationService;
  let usageProjectionService: UsageProjectionService;
  let usageIngestionService: UsageIngestionService;
  let aggregatedUsageRepo: AggregatedUsageRepository;
  let usageLedgerRepo: UsageLedgerRepository;
  let featuresRepo: FeaturesRepository;
  let queue: Queue;

  beforeAll(async () => {
    app = await createTestApp();
    enforcementService = app.module.get(EntitlementEnforcementService);
    reconciliationService = app.module.get(ProjectionReconciliationService);
    usageProjectionService = app.module.get(UsageProjectionService);
    usageIngestionService = app.module.get(UsageIngestionService);
    aggregatedUsageRepo = app.module.get(AggregatedUsageRepository);
    usageLedgerRepo = app.module.get(UsageLedgerRepository);
    featuresRepo = app.module.get(FeaturesRepository);
    queue = app.module.get<Queue>(
      getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING),
    );
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

  // -------------------------------------------------------------------------
  // Async path
  // -------------------------------------------------------------------------

  // Limited features are always checked synchronously (strict CAS); the async projection path
  // runs for unlimited ones, so these tests use the unlimited Infrastructure plan
  describe('Async path', () => {
    it('Test 1: single request — ledger sync, projection async', async () => {
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'infrastructure',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');
      expect(feature).not.toBeNull();

      // ---- Immediate state after checkAndRecord (before processor runs) ----
      // Stop the worker from picking up the job by waiting until after assertions.
      // We rely on the fact that in test env, queue processing is async and the
      // below assertions can run before BullMQ dispatches the job.
      //
      // To guarantee timing, we pause the queue, assert pre-state, then resume.
      await queue.pause();
      let result;
      try {
        result = await enforcementService.checkAndRecord({
          tenantId: tenant.id,
          featureKey: 'documents_per_month',
          units: 1,
        });

        expect(result.allowed).toBe(true);
        expect(result.source).toBe('plan');

        // Ledger row written synchronously
        const ledgerCount = await countLedgerRows(app, tenant.id, feature!.id);
        expect(ledgerCount).toBe(1);

        // Allocations written synchronously
        const allocCount = await countAllocationRows(
          app,
          tenant.id,
          feature!.id,
        );
        expect(allocCount).toBe(1);

        // Projection NOT yet updated (job hasn't processed)
        const preProjection = await getAggregatedUsage(
          app,
          tenant.id,
          subscription.id,
          feature!.id,
        );
        expect(preProjection).toBeNull();
      } finally {
        await queue.resume();
      }

      // ---- Post-processing state ----
      await waitForQueueIdle(queue, 15000);

      const projection = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(projection).not.toBeNull();
      expect(projection.total_units).toBe(1);
      expect(projection.plan_units).toBe(1);

      const events = await getDomainEvents(app, tenant.id, 'usage.recorded');
      expect(events).toHaveLength(1);
      expect(events[0].payload.event_type).toBeUndefined(); // payload is an object
      expect(events[0].payload.enforcement_mode).toBe('async');
      expect(events[0].payload.feature_key).toBe('documents_per_month');
    }, 30000);

    it('Test 2: 10 concurrent requests — no serialization errors', async () => {
      // general_counsel: 100 doc quota — well above threshold so async path is used
      const tenant = await createTestTenant(app.module);
      await createTestSubscription(app.module, tenant.id, {
        planKey: 'infrastructure',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');

      // Fire 10 concurrent checkAndRecord calls
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          enforcementService.checkAndRecord({
            tenantId: tenant.id,
            featureKey: 'documents_per_month',
            units: 1,
          }),
        ),
      );

      // All 10 succeed with no errors
      expect(results).toHaveLength(10);
      for (const r of results) {
        expect(r.allowed).toBe(true);
      }

      // Ledger has exactly 10 rows
      const ledgerCount = await countLedgerRows(app, tenant.id, feature!.id);
      expect(ledgerCount).toBe(10);

      // Allocations has exactly 10 rows
      const allocCount = await countAllocationRows(app, tenant.id, feature!.id);
      expect(allocCount).toBe(10);

      // Drain queue and verify projection
      await waitForQueueIdle(queue, 15000);

      // Find subscription for assertion
      const sub = await withTenantContext(
        app.databaseService,
        tenant.id,
        async (client) => {
          const result = await client.query(
            `SELECT id FROM public.tenant_subscriptions WHERE tenant_id = $1 AND status = 'active'`,
            [tenant.id],
          );
          return result.rows[0] as { id: string };
        },
      );
      const projection = await getAggregatedUsage(
        app,
        tenant.id,
        sub.id,
        feature!.id,
      );
      expect(projection).not.toBeNull();
      expect(projection.total_units).toBe(10);
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Strict mode
  // -------------------------------------------------------------------------

  describe('Strict mode', () => {
    it('Test 3: burst near limit — strict CAS prevents overshoot', async () => {
      // shield: 25 doc quota. Pre-populate at 23 (remaining=2, threshold=3 → strict).
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'shield',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');
      expect(feature).not.toBeNull();

      const billingPeriod = deriveBillingPeriod(
        subscription.current_period_start,
      );

      // Pre-populate aggregated_usage at 23
      await app.databaseService.transactionWithTenantContext(
        { tenantId: tenant.id },
        async (client) => {
          await aggregatedUsageRepo.upsert(
            {
              tenant_id: tenant.id,
              subscription_id: subscription.id,
              feature_id: feature!.id,
              billing_period: billingPeriod,
              total_units: 23,
              plan_units: 23,
              addon_units: 0,
              credit_units: 0,
              override_units: 0,
            },
            { client },
          );
        },
      );

      // Fire 5 concurrent calls — only 2 should succeed (quota=25, used=23, limit=25)
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          enforcementService.checkAndRecord({
            tenantId: tenant.id,
            featureKey: 'documents_per_month',
            units: 1,
          }),
        ),
      );

      const allowed = results.filter((r) => r.allowed);
      const denied = results.filter((r) => !r.allowed);

      expect(allowed).toHaveLength(2);
      expect(denied).toHaveLength(3);
      for (const d of denied) {
        expect(d.reason).toBe('quota_exceeded');
      }

      // aggregated_usage must be exactly at the limit — no overshoot
      const projection = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(projection).not.toBeNull();
      expect(projection.total_units).toBe(25);
      expect(projection.plan_units).toBe(25);

      // Ledger has exactly 2 rows (the 3 denied calls rollbacked their savepoints)
      const ledgerCount = await countLedgerRows(app, tenant.id, feature!.id);
      expect(ledgerCount).toBe(2);
    }, 30000);

    it('Test 4: strict mode sequential — exact enforcement at boundary', async () => {
      // shield: 25 quota. Pre-populate at 23 (remaining=2, threshold=3 → strict).
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'shield',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');
      expect(feature).not.toBeNull();

      const billingPeriod = deriveBillingPeriod(
        subscription.current_period_start,
      );

      // Pre-populate at 23
      await app.databaseService.transactionWithTenantContext(
        { tenantId: tenant.id },
        async (client) => {
          await aggregatedUsageRepo.upsert(
            {
              tenant_id: tenant.id,
              subscription_id: subscription.id,
              feature_id: feature!.id,
              billing_period: billingPeriod,
              total_units: 23,
              plan_units: 23,
              addon_units: 0,
              credit_units: 0,
              override_units: 0,
            },
            { client },
          );
        },
      );

      // Call 1: used=23, remaining=2 ≥ 1, strict → CAS succeeds → total=24
      const r1 = await enforcementService.checkAndRecord({
        tenantId: tenant.id,
        featureKey: 'documents_per_month',
        units: 1,
      });
      expect(r1.allowed).toBe(true);

      const p1 = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(p1.total_units).toBe(24);

      // Call 2: used=24, remaining=1 ≥ 1, strict → CAS succeeds → total=25
      const r2 = await enforcementService.checkAndRecord({
        tenantId: tenant.id,
        featureKey: 'documents_per_month',
        units: 1,
      });
      expect(r2.allowed).toBe(true);

      const p2 = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(p2.total_units).toBe(25);

      // Call 3: used=25, remaining=0 < 1, no credits → denied
      const r3 = await enforcementService.checkAndRecord({
        tenantId: tenant.id,
        featureKey: 'documents_per_month',
        units: 1,
      });
      expect(r3.allowed).toBe(false);
      expect(r3.reason).toBe('quota_exceeded');

      // aggregated_usage unchanged after denial
      const p3 = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(p3.total_units).toBe(25);

      // Ledger has only 2 rows (only successful writes committed)
      const ledgerCount = await countLedgerRows(app, tenant.id, feature!.id);
      expect(ledgerCount).toBe(2);
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Processor resilience
  // -------------------------------------------------------------------------

  describe('Processor resilience', () => {
    it('Test 5: processor failure — retry and eventual consistency', async () => {
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'infrastructure',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');
      expect(feature).not.toBeNull();

      // Spy: first call throws RetryableError, subsequent calls use original impl
      const originalIncrementUsage = usageProjectionService.incrementUsage.bind(
        usageProjectionService,
      );
      jest
        .spyOn(usageProjectionService, 'incrementUsage')
        .mockRejectedValueOnce(new RetryableError('simulated transient error'))
        .mockImplementation(
          (input: IncrementUsageInput, options?: QueryOptions) =>
            originalIncrementUsage(input, options),
        );

      await enforcementService.checkAndRecord({
        tenantId: tenant.id,
        featureKey: 'documents_per_month',
        units: 1,
      });

      // Wait for job to complete including the retry (backoff=500ms)
      await waitForQueueIdle(queue, 20000);

      const projection = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(projection).not.toBeNull();
      expect(projection.total_units).toBe(1);
      expect(projection.plan_units).toBe(1);

      const events = await getDomainEvents(app, tenant.id, 'usage.recorded');
      expect(events).toHaveLength(1);
      expect(events[0].payload.enforcement_mode).toBe('async');
    }, 40000);

    it('Test 6: BullMQ unavailable — sync fallback', async () => {
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'infrastructure',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');
      expect(feature).not.toBeNull();

      // Spy: enqueue throws (simulates Redis/BullMQ unavailable)
      jest
        .spyOn(app.queueProducerService, 'enqueue')
        .mockRejectedValueOnce(new Error('Redis connection refused'));

      const loggerWarnSpy = jest.spyOn(
        (
          enforcementService as unknown as {
            logger: { warn: (...args: unknown[]) => void };
          }
        ).logger,
        'warn',
      );

      await enforcementService.checkAndRecord({
        tenantId: tenant.id,
        featureKey: 'documents_per_month',
        units: 1,
      });

      // Sync fallback runs inline (no queue) — assert immediately
      const ledgerRow = await withTenantContext(
        app.databaseService,
        tenant.id,
        async (client) => {
          const result = await client.query(
            `SELECT id, projected_at FROM public.usage_ledger
             WHERE tenant_id = $1 AND feature_id = $2
             ORDER BY recorded_at DESC LIMIT 1`,
            [tenant.id, feature!.id],
          );
          return result.rows[0];
        },
      );
      expect(ledgerRow).not.toBeNull();
      expect(ledgerRow.projected_at).not.toBeNull();

      const projection = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(projection).not.toBeNull();
      expect(projection.total_units).toBe(1);

      const events = await getDomainEvents(app, tenant.id, 'usage.recorded');
      expect(events).toHaveLength(1);
      expect(events[0].payload.enforcement_mode).toBe('sync_fallback');
      expect(events[0].payload.fallback).toBe(true);
      expect(events[0].metadata.fallback_reason).toBe('bullmq_unavailable');

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[projection.fallback_to_sync]'),
      );

      // Double-projection prevention: claimForProjection on already-projected row returns false
      const reclaimResult =
        await app.databaseService.transactionWithTenantContext(
          { tenantId: tenant.id },
          async (client) => {
            return usageLedgerRepo.claimForProjection(ledgerRow.id as string, {
              client,
            });
          },
        );
      expect(reclaimResult).toBe(false);
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Type safety
  // -------------------------------------------------------------------------

  describe('Type safety', () => {
    it('Test 7: type-safe enqueue — correct queue and job name', async () => {
      // shield: 25 quota, used=0, threshold=3, remaining=25 → async path
      const tenant = await createTestTenant(app.module);
      await createTestSubscription(app.module, tenant.id, {
        planKey: 'infrastructure',
      });

      const enqueueSpy = jest.spyOn(app.queueProducerService, 'enqueue');

      await enforcementService.checkAndRecord({
        tenantId: tenant.id,
        featureKey: 'documents_per_month',
        units: 1,
      });

      expect(enqueueSpy).toHaveBeenCalledTimes(1);
      const [queueName, jobName, data] = enqueueSpy.mock
        .calls[0] as unknown as [
        string,
        string,
        EntitlementProjectionUpdateJobData,
      ];
      expect(queueName).toBe(QUEUE_NAMES.ENTITLEMENT_PROCESSING);
      expect(jobName).toBe(ENTITLEMENT_JOB_NAMES.PROJECTION_UPDATE);

      // Verify payload shape matches EntitlementProjectionUpdateJobData
      expect(data.usageLedgerId).toBeDefined();
      expect(data.tenantId).toBe(tenant.id);
      expect(data.featureKey).toBe('documents_per_month');
      expect(data.featureId).toBeDefined();
      expect(data.subscriptionId).toBeDefined();
      expect(data.units).toBe(1);
      expect(data.billingPeriod).toBeDefined();
      expect(data.allocations).toEqual([{ source: 'plan', units: 1 }]);
      expect(data.recordedAt).toBeDefined();
      expect(typeof data.creditDeducted).toBe('boolean');

      // Drain the actually-enqueued job so it doesn't leak into the next test
      await waitForQueueIdle(queue, 10000);
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------

  describe('Reconciliation', () => {
    it('Test 8: drift detection and correction (per-source)', async () => {
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'shield',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');
      expect(feature).not.toBeNull();

      // Insert 5 ledger+allocation rows directly via ingestion service (no projection)
      // 3 plan-sourced + 2 credit-sourced
      for (let i = 0; i < 3; i++) {
        await usageIngestionService.recordUsage({
          tenant_id: tenant.id,
          feature_key: 'documents_per_month',
          units: 1,
          allocations: [{ source: 'plan', units: 1 }],
        });
      }
      for (let i = 0; i < 2; i++) {
        await usageIngestionService.recordUsage({
          tenant_id: tenant.id,
          feature_key: 'documents_per_month',
          units: 1,
          allocations: [{ source: 'credit', units: 1 }],
        });
      }

      // aggregated_usage must be empty at this point (no projection yet)
      const preDrift = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(preDrift).toBeNull();

      // Reconcile — should detect drift and correct it
      const result = await reconciliationService.reconcile(tenant.id);

      expect(result.checked).toBe(1);
      expect(result.drifted).toBe(1);
      expect(result.corrected).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.failedDetails).toHaveLength(0);

      const postProjection = await getAggregatedUsage(
        app,
        tenant.id,
        subscription.id,
        feature!.id,
      );
      expect(postProjection).not.toBeNull();
      expect(postProjection.total_units).toBe(5);
      expect(postProjection.plan_units).toBe(3);
      expect(postProjection.credit_units).toBe(2);
      expect(postProjection.addon_units).toBe(0);
    }, 30000);

    it('Test 9: reconciliation cross-tenant uses platform admin context', async () => {
      // Create 2 tenants with usage data and drifted projections
      const tenant1 = await createTestTenant(app.module);
      const tenant2 = await createTestTenant(app.module);
      await createTestSubscription(app.module, tenant1.id, {
        planKey: 'shield',
      });
      await createTestSubscription(app.module, tenant2.id, {
        planKey: 'shield',
      });

      // Insert 2 usage records for tenant1, 3 for tenant2 (bypassing projection)
      for (let i = 0; i < 2; i++) {
        await usageIngestionService.recordUsage({
          tenant_id: tenant1.id,
          feature_key: 'documents_per_month',
          units: 1,
          allocations: [{ source: 'plan', units: 1 }],
        });
      }
      for (let i = 0; i < 3; i++) {
        await usageIngestionService.recordUsage({
          tenant_id: tenant2.id,
          feature_key: 'documents_per_month',
          units: 1,
          allocations: [{ source: 'plan', units: 1 }],
        });
      }

      // Cross-tenant reconcile (no tenantId) — uses platform admin context
      const result = await reconciliationService.reconcile();

      // Both tenants must be corrected
      expect(result.checked).toBeGreaterThanOrEqual(2);
      expect(result.drifted).toBeGreaterThanOrEqual(2);
      expect(result.corrected).toBeGreaterThanOrEqual(2);
      expect(result.failed).toBe(0);

      // Verify both projections are now correct
      const feature = await featuresRepo.findByKey('documents_per_month');
      const sub1 = await withTenantContext(
        app.databaseService,
        tenant1.id,
        async (client) => {
          const r = await client.query(
            `SELECT id FROM public.tenant_subscriptions WHERE tenant_id = $1 AND status = 'active'`,
            [tenant1.id],
          );
          return r.rows[0] as { id: string };
        },
      );
      const sub2 = await withTenantContext(
        app.databaseService,
        tenant2.id,
        async (client) => {
          const r = await client.query(
            `SELECT id FROM public.tenant_subscriptions WHERE tenant_id = $1 AND status = 'active'`,
            [tenant2.id],
          );
          return r.rows[0] as { id: string };
        },
      );

      const proj1 = await getAggregatedUsage(
        app,
        tenant1.id,
        sub1.id,
        feature!.id,
      );
      expect(proj1?.total_units).toBe(2);

      const proj2 = await getAggregatedUsage(
        app,
        tenant2.id,
        sub2.id,
        feature!.id,
      );
      expect(proj2?.total_units).toBe(3);
    }, 30000);

    it('Test 10: reconciliation per-row error resilience', async () => {
      // Pause queue so projection stays empty — recordUsage queues PROJECTION_UPDATE
      // but we need drift (ledger populated, projection empty) for reconcile to correct
      await queue.pause();
      try {
        // Create 3 tenants, all with drift
        const tenants = await Promise.all([
          createTestTenant(app.module),
          createTestTenant(app.module),
          createTestTenant(app.module),
        ]);
        for (const tenant of tenants) {
          await createTestSubscription(app.module, tenant.id, {
            planKey: 'shield',
          });
          await usageIngestionService.recordUsage({
            tenant_id: tenant.id,
            feature_key: 'documents_per_month',
            units: 1,
            allocations: [{ source: 'plan', units: 1 }],
          });
        }

        // Spy: fail on exactly the 2nd call to rebuildFromLedger
        const original = usageProjectionService.rebuildFromLedger.bind(
          usageProjectionService,
        );
        let callCount = 0;
        jest
          .spyOn(usageProjectionService, 'rebuildFromLedger')
          .mockImplementation((...args) => {
            callCount++;
            if (callCount === 2) {
              throw new Error('simulated rebuild failure for tenant 2');
            }
            return original(...(args as Parameters<typeof original>));
          });

        const result = await reconciliationService.reconcile();

        expect(result.corrected).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.failedDetails).toHaveLength(1);
        expect(result.failedDetails[0].error).toContain(
          'simulated rebuild failure',
        );
      } finally {
        await queue.resume();
      }
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Low-level
  // -------------------------------------------------------------------------

  describe('Low-level', () => {
    it('Test 11: claimForProjection atomic CAS behavior', async () => {
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'shield',
      });
      const feature = await featuresRepo.findByKey('documents_per_month');
      expect(feature).not.toBeNull();

      const billingPeriod = deriveBillingPeriod(
        subscription.current_period_start,
      );

      // Insert a usage_ledger row directly (projected_at starts NULL)
      const ledgerRow = await withTenantContext(
        app.databaseService,
        tenant.id,
        async (client) => {
          return usageLedgerRepo.record(
            {
              tenant_id: tenant.id,
              feature_id: feature!.id,
              user_id: undefined,
              units: 1,
              billing_period: billingPeriod,
              metadata: '{}',
            },
            { client },
          );
        },
      );
      expect(ledgerRow.projected_at).toBeUndefined();

      // First claim: should succeed (projected_at: NULL → timestamp)
      const claimed1 = await app.databaseService.transactionWithTenantContext(
        { tenantId: tenant.id },
        async (client) => {
          return usageLedgerRepo.claimForProjection(ledgerRow.id, { client });
        },
      );
      expect(claimed1).toBe(true);

      // Verify projected_at is now set
      const afterClaim = await withTenantContext(
        app.databaseService,
        tenant.id,
        async (client) => {
          const result = await client.query(
            `SELECT projected_at FROM public.usage_ledger WHERE id = $1`,
            [ledgerRow.id],
          );
          return result.rows[0];
        },
      );
      expect(afterClaim.projected_at).not.toBeNull();

      // Second claim on the same row: returns false (already claimed)
      const claimed2 = await app.databaseService.transactionWithTenantContext(
        { tenantId: tenant.id },
        async (client) => {
          return usageLedgerRepo.claimForProjection(ledgerRow.id, { client });
        },
      );
      expect(claimed2).toBe(false);

      // Immutability trigger: UPDATE on any non-projected_at column raises ERRCODE 42501
      // Run as the DB owner (test superuser) so the trigger fires (not just a permission error).
      const rawClient = await app.databaseService.getClient();
      let triggerError: (Error & { code?: string }) | undefined;
      try {
        await rawClient.query('BEGIN');
        await rawClient.query(
          'UPDATE public.usage_ledger SET units = 999 WHERE id = $1',
          [ledgerRow.id],
        );
        await rawClient.query('COMMIT');
      } catch (err) {
        triggerError = err as Error & { code?: string };
        await rawClient.query('ROLLBACK').catch(() => undefined);
      } finally {
        rawClient.release();
      }
      expect(triggerError).toBeDefined();
      expect(triggerError!.code).toBe('42501');
    }, 30000);

    it('Test 12: buildUsageRecordedEvent produces consistent payloads', () => {
      const jobData: EntitlementProjectionUpdateJobData = {
        usageLedgerId: 'ledger-id-123',
        tenantId: 'tenant-id-456',
        featureKey: 'documents_per_month',
        featureId: 'feature-id-789',
        featureName: 'Documents Per Month',
        featureType: 'quota',
        subscriptionId: 'sub-id-101',
        units: 1,
        billingPeriod: '2026-03',
        allocations: [{ source: 'plan', units: 1 }],
        recordedAt: new Date().toISOString(),
        creditDeducted: false,
      };

      const asyncEvent = buildUsageRecordedEvent(jobData, 'async', {
        job_id: 'job-123',
        attempt: 1,
      });
      const syncFallbackEvent = buildUsageRecordedEvent(
        jobData,
        'sync_fallback',
        { fallback_reason: 'bullmq_unavailable' },
      );

      // Both produce the same top-level structure
      expect(asyncEvent.event_type).toBe('usage.recorded');
      expect(syncFallbackEvent.event_type).toBe('usage.recorded');
      expect(asyncEvent.aggregate_type).toBe('usage');
      expect(syncFallbackEvent.aggregate_type).toBe('usage');

      // Both payloads contain the same set of keys
      const asyncPayload = JSON.parse(asyncEvent.payload) as Record<
        string,
        unknown
      >;
      const syncPayload = JSON.parse(syncFallbackEvent.payload) as Record<
        string,
        unknown
      >;
      const asyncKeys = Object.keys(asyncPayload).sort();
      const syncKeys = Object.keys(syncPayload).sort();
      expect(asyncKeys).toEqual(syncKeys);

      // enforcement_mode and fallback differ as expected
      expect(asyncPayload.enforcement_mode).toBe('async');
      expect(asyncPayload.fallback).toBe(false);
      expect(syncPayload.enforcement_mode).toBe('sync_fallback');
      expect(syncPayload.fallback).toBe(true);

      // Caller-specific metadata fields differ
      const asyncMeta = JSON.parse(asyncEvent.metadata as string) as Record<
        string,
        unknown
      >;
      const syncMeta = JSON.parse(
        syncFallbackEvent.metadata as string,
      ) as Record<string, unknown>;
      expect(asyncMeta.job_id).toBe('job-123');
      expect(asyncMeta.attempt).toBe(1);
      expect(syncMeta.fallback_reason).toBe('bullmq_unavailable');
    });
  });
});

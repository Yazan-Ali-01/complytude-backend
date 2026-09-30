import {
  BILLING_JOB_NAMES,
  getQueueToken,
  QUEUE_NAMES,
  QueueProducerService,
  type Job,
  type EntitlementTrialExpiryCheckJobData,
  type Queue,
} from '@lib/queue';
import type { DatabaseService } from '@lib/database';
import { randomUUID } from 'node:crypto';
import { TrialExpiryHandler } from 'src/modules/entitlements/processors/trial-expiry.handler';
import { UsageRefundHandler } from 'src/modules/entitlements/processors/usage-refund.handler';
import { EntitlementCacheService } from 'src/modules/entitlements/services/entitlement-cache.service';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { ProjectionReconciliationService } from 'src/modules/entitlements/services/projection-reconciliation.service';
import { SubscriptionsService } from 'src/modules/subscriptions/subscriptions.service';
import { createTestSubscription, createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { TEST_ADMIN_DATABASE } from '../setup/admin-database';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Monthly allowances count per billing period (BILL-003): when a period ends, whether a free-plan
 * renewal, a Stripe renewal or a trial ending, the full allowance is usable again.
 */
describe('Quotas reset every billing period', () => {
  let app: TestApp;
  let admin: DatabaseService;
  let enforcement: EntitlementEnforcementService;

  beforeAll(async () => {
    app = await createTestApp();
    admin = app.module.get<DatabaseService>(TEST_ADMIN_DATABASE);
    enforcement = app.module.get(EntitlementEnforcementService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  // Usage writes queue projection and notification jobs; let them finish
  afterEach(async () => {
    await settle();
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function queue(name: string): Queue {
    return app.module.get<Queue>(getQueueToken(name));
  }

  async function settle(): Promise<void> {
    await waitForQueueIdle(queue(QUEUE_NAMES.ENTITLEMENT_PROCESSING), 30000);
  }

  /** One generated document, as generate() records it; settles the projection after. */
  async function generate(tenantId: string): Promise<boolean> {
    const result = await enforcement.checkAndRecord({
      tenantId,
      featureKey: 'documents_per_month',
      metadata: { resource_id: randomUUID(), resource_type: 'generation_job' },
    });
    await settle();
    return result.allowed;
  }

  async function useAll(tenantId: string, allowance: number): Promise<void> {
    for (let i = 0; i < allowance; i++) {
      expect(`document ${i + 1}: ${await generate(tenantId)}`).toBe(
        `document ${i + 1}: true`,
      );
    }
    expect(await generate(tenantId)).toBe(false);
  }

  async function used(tenantId: string): Promise<number> {
    return (
      await enforcement.peekUsage({
        tenantId,
        featureKey: 'documents_per_month',
      })
    ).used;
  }

  it('a free-plan tenant gets its full allowance again once the renewal job starts a new period', async () => {
    const tenantId = (await createTestTenant(app.module)).id;
    await createTestSubscription(app.module, tenantId, {
      planKey: 'navigator',
    });
    await useAll(tenantId, 3);

    // The period ends; until the renewal runs, the old period (and its usage) still applies
    await admin.query(
      `UPDATE public.tenant_subscriptions
       SET current_period_end = now() - interval '1 minute'
       WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(await generate(tenantId)).toBe(false);

    await app.module
      .get(QueueProducerService)
      .enqueue(
        QUEUE_NAMES.BILLING_PROCESSING,
        BILLING_JOB_NAMES.SUBSCRIPTION_RENEWAL,
        {},
      );
    await waitForQueueIdle(queue(QUEUE_NAMES.BILLING_PROCESSING), 30000);

    const { rows } = await admin.query<{ started: boolean; ends: boolean }>(
      `SELECT current_period_start <= now() AS started,
              current_period_end > now() AS ends
       FROM public.tenant_subscriptions WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(rows[0]).toEqual({ started: true, ends: true });
    expect(await used(tenantId)).toBe(0);
    await useAll(tenantId, 3);
  });

  it('a renewal that ran late catches up to the period containing now', async () => {
    const tenantId = (await createTestTenant(app.module)).id;
    await createTestSubscription(app.module, tenantId, {
      planKey: 'navigator',
    });
    await admin.query(
      `UPDATE public.tenant_subscriptions
       SET current_period_start = now() - interval '3 months 2 days',
           current_period_end = now() - interval '2 months 2 days'
       WHERE tenant_id = $1`,
      [tenantId],
    );

    await app.module.get(SubscriptionsService).renewAllDuePeriods();

    const { rows } = await admin.query<{ contains_now: boolean }>(
      `SELECT current_period_start <= now() AND current_period_end > now() AS contains_now
       FROM public.tenant_subscriptions WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(rows[0].contains_now).toBe(true);
  });

  it('a paid tenant gets its full allowance again when Stripe starts the next period', async () => {
    const tenantId = (await createTestTenant(app.module)).id;
    await createTestSubscription(app.module, tenantId, { planKey: 'shield' });
    await useAll(tenantId, 25);

    // What invoice.paid / customer.subscription.updated do at renewal: store the new period and
    // drop the cached subscription
    await admin.query(
      `UPDATE public.tenant_subscriptions
       SET current_period_start = current_period_end,
           current_period_end = current_period_end + interval '1 month'
       WHERE tenant_id = $1`,
      [tenantId],
    );
    app.module.get(EntitlementCacheService).invalidateSubscription(tenantId);

    expect(await used(tenantId)).toBe(0);
    expect(await generate(tenantId)).toBe(true);
    expect(await used(tenantId)).toBe(1);
  });

  it("a trial's usage doesn't follow the tenant onto the free plan", async () => {
    const tenantId = (await createTestTenant(app.module)).id;
    await admin.transaction((client) =>
      app.module
        .get(SubscriptionsService)
        .createTrialSubscription(tenantId, null, { client }),
    );
    for (let i = 0; i < 5; i++) expect(await generate(tenantId)).toBe(true);

    await admin.query(
      `UPDATE public.tenant_subscriptions SET trial_ends_at = now() - interval '1 minute'
       WHERE tenant_id = $1`,
      [tenantId],
    );
    await app.module.get(TrialExpiryHandler).execute({
      id: 'trial-expiry-test',
      data: { triggeredAt: new Date().toISOString() },
    } as Job<EntitlementTrialExpiryCheckJobData>);

    // Navigator allows 3 a month: the trial's 5 don't count against it
    expect(await used(tenantId)).toBe(0);
    await useAll(tenantId, 3);
  });

  it('reconciliation reads the current period, and a refund is not drift', async () => {
    const tenantId = (await createTestTenant(app.module)).id;
    await createTestSubscription(app.module, tenantId, { planKey: 'shield' });
    const jobId = randomUUID();
    const result = await enforcement.checkAndRecord({
      tenantId,
      featureKey: 'documents_per_month',
      metadata: { resource_id: jobId, resource_type: 'generation_job' },
    });
    expect(result.allowed).toBe(true);
    expect(await generate(tenantId)).toBe(true);
    await app.module.get(UsageRefundHandler).execute({
      data: {
        tenantId,
        resourceId: jobId,
        resourceType: 'generation_job',
        featureKey: 'documents_per_month',
        units: 1,
      },
    } as Parameters<UsageRefundHandler['execute']>[0]);
    expect(await used(tenantId)).toBe(1);

    const reconciliation = app.module.get(ProjectionReconciliationService);
    const report = await reconciliation.reconcile(tenantId);

    expect(report).toMatchObject({ checked: 1, drifted: 0, failed: 0 });
    expect(await used(tenantId)).toBe(1);
  });
});

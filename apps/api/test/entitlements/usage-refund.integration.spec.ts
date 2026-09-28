import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { randomUUID } from 'node:crypto';
import { UsageRefundHandler } from 'src/modules/entitlements/processors/usage-refund.handler';
import { CreditLedgerService } from 'src/modules/entitlements/services/credit-ledger.service';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { UsageLedgerRepository } from 'src/repositories/usage/usage-ledger.repository';
import { createTestSubscription, createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * A job that fails permanently after its usage was recorded gets it back: the usage row is
 * voided, the quota restored and the credits it spent refunded. Runs as the app role.
 */
describe('Usage refunds for failed jobs (app role)', () => {
  let app: TestApp;
  let enforcement: EntitlementEnforcementService;
  let credits: CreditLedgerService;
  let refunds: UsageRefundHandler;

  beforeAll(async () => {
    app = await createTestApp();
    enforcement = app.module.get(EntitlementEnforcementService);
    credits = app.module.get(CreditLedgerService);
    refunds = app.module.get(UsageRefundHandler);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  // Usage and credit writes queue projection and notification jobs; let them finish
  afterEach(async () => {
    await settle();
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function settle(): Promise<void> {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
  }

  /** Records one generated document for a (fake) generation job, as generate() does. */
  async function generate(tenantId: string): Promise<string> {
    const jobId = randomUUID();
    const result = await enforcement.checkAndRecord({
      tenantId,
      featureKey: 'documents_per_month',
      units: 1,
      metadata: { resource_id: jobId, resource_type: 'generation_job' },
    });
    expect(result.allowed).toBe(true);
    return jobId;
  }

  function refund(tenantId: string, jobId: string): Promise<void> {
    return refunds.execute({
      data: {
        tenantId,
        resourceId: jobId,
        resourceType: 'generation_job',
        featureKey: 'documents_per_month',
        units: 1,
      },
    } as never);
  }

  async function used(tenantId: string): Promise<number> {
    await settle();
    return (
      await enforcement.peekUsage({
        tenantId,
        featureKey: 'documents_per_month',
      })
    ).used;
  }

  async function ledgerRow(
    jobId: string,
  ): Promise<{ resource_id: string | null; voided: boolean }> {
    const { rows } = await app.databaseService.query<{
      resource_id: string | null;
      voided: boolean;
    }>(
      `SELECT resource_id, voided_at IS NOT NULL AS voided FROM public.usage_ledger
       WHERE metadata->>'resource_id' = $1`,
      [jobId],
    );
    return rows[0];
  }

  async function navigatorTenant(): Promise<string> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'navigator',
    });
    return tenant.id;
  }

  it('voids the usage row and gives the quota back', async () => {
    const tenantId = await navigatorTenant();
    const first = await generate(tenantId);
    await generate(tenantId);
    expect(await used(tenantId)).toBe(2);
    expect(await ledgerRow(first)).toEqual({
      resource_id: first,
      voided: false,
    });

    await refund(tenantId, first);

    expect(await ledgerRow(first)).toEqual({
      resource_id: first,
      voided: true,
    });
    expect(await used(tenantId)).toBe(1);
  });

  it('refunds the credits a credit-funded document spent', async () => {
    const tenantId = await navigatorTenant();
    for (let i = 0; i < 3; i++) await generate(tenantId); // the plan's 3 documents
    await credits.grant({ tenantId, amount: 10, reason: 'test' });
    const overQuota = await generate(tenantId); // paid with 5 credits
    expect(
      await credits.getBalance(tenantId, {
        tenant: { tenantId, schema: 'public' },
      }),
    ).toBe(5);
    expect(await used(tenantId)).toBe(4);

    await refund(tenantId, overQuota);

    expect(
      await credits.getBalance(tenantId, {
        tenant: { tenantId, schema: 'public' },
      }),
    ).toBe(10);
    expect(await used(tenantId)).toBe(3);
  });

  it('a repeated refund changes nothing', async () => {
    const tenantId = await navigatorTenant();
    for (let i = 0; i < 3; i++) await generate(tenantId);
    await credits.grant({ tenantId, amount: 10, reason: 'test' });
    const overQuota = await generate(tenantId);

    await refund(tenantId, overQuota);
    await refund(tenantId, overQuota);

    expect(
      await credits.getBalance(tenantId, {
        tenant: { tenantId, schema: 'public' },
      }),
    ).toBe(10);
    expect(await used(tenantId)).toBe(3);
  });

  it('a row voided before its projection runs is never projected', async () => {
    const tenantId = await navigatorTenant();
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.usage_ledger (tenant_id, feature_id, units, billing_period, voided_at)
       VALUES ($1, (SELECT id FROM public.features WHERE key = 'documents_per_month'), 1, '2026-09', now())
       RETURNING id`,
      [tenantId],
    );

    const claimed = await app.appDatabaseService.transactionWithTenantContext(
      { tenantId },
      (client) =>
        app.module
          .get(UsageLedgerRepository)
          .claimForProjection(rows[0].id, { client }),
    );

    expect(claimed).toBe(false);
  });
});

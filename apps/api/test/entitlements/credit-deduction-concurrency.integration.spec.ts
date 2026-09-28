import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { CreditLedgerService } from 'src/modules/entitlements/services/credit-ledger.service';
import { createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Credits are a SUM over an append-only ledger, so deductions must be serialised per tenant:
 * concurrent deductions may never spend more than the balance.
 */
describe('Credit deduction under concurrency (app role)', () => {
  let app: TestApp;
  let credits: CreditLedgerService;

  beforeAll(async () => {
    app = await createTestApp();
    credits = app.module.get(CreditLedgerService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  // Every grant and deduction queues a credit notification; let them finish before the next test
  // and before shutdown
  afterEach(async () => {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function ledger(
    tenantId: string,
  ): Promise<{ balance: number; deductions: number }> {
    const { rows } = await app.databaseService.query<{
      balance: string;
      deductions: string;
    }>(
      `SELECT COALESCE(SUM(amount), 0) AS balance,
              COUNT(*) FILTER (WHERE transaction_type = 'deduction') AS deductions
       FROM public.credit_ledger WHERE tenant_id = $1`,
      [tenantId],
    );
    return {
      balance: Number(rows[0].balance),
      deductions: Number(rows[0].deductions),
    };
  }

  it('50 concurrent deductions against a balance of 10 succeed exactly 10 times', async () => {
    const tenant = await createTestTenant(app.module);
    await credits.grant({ tenantId: tenant.id, amount: 10, reason: 'test' });

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        credits.deduct({ tenantId: tenant.id, amount: 1 }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(await ledger(tenant.id)).toEqual({ balance: 0, deductions: 10 });
  }, 60000);

  it('another tenant is not held up by the lock', async () => {
    const [a, b] = [
      await createTestTenant(app.module),
      await createTestTenant(app.module),
    ];
    await credits.grant({ tenantId: a.id, amount: 5, reason: 'test' });
    await credits.grant({ tenantId: b.id, amount: 5, reason: 'test' });

    await Promise.all([
      ...Array.from({ length: 5 }, () =>
        credits.deduct({ tenantId: a.id, amount: 1 }),
      ),
      ...Array.from({ length: 5 }, () =>
        credits.deduct({ tenantId: b.id, amount: 1 }),
      ),
    ]);

    expect(await ledger(a.id)).toEqual({ balance: 0, deductions: 5 });
    expect(await ledger(b.id)).toEqual({ balance: 0, deductions: 5 });
  }, 60000);
});

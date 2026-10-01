import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { CreditExpiryHandler } from 'src/modules/entitlements/processors/credit-expiry.handler';
import { CreditLedgerService } from 'src/modules/entitlements/services/credit-ledger.service';
import { createTestTenant } from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * A lapsing credit grant takes out only what is left of it: the hourly job writes an `expiry` row
 * for its unspent part, and purchased credits stay.
 */
describe('Credit expiry', () => {
  let app: TestApp;
  let credits: CreditLedgerService;

  beforeAll(async () => {
    app = await createTestApp();
    credits = app.module.get(CreditLedgerService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterEach(async () => {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** A ledger row written as it happened, `daysAgo` days back (the ledger can't be updated). */
  async function record(
    tenantId: string,
    type: 'purchase' | 'grant' | 'deduction',
    amount: number,
    daysAgo: number,
    expiresInDays?: number,
  ): Promise<string> {
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.credit_ledger
         (tenant_id, transaction_type, amount, balance_after, expires_at, recorded_at)
       VALUES ($1, $2, $3, 0,
               CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5) END,
               now() - make_interval(days => $4))
       RETURNING id`,
      [tenantId, type, amount, daysAgo, expiresInDays ?? null],
    );
    return rows[0].id;
  }

  async function expiryRows(
    tenantId: string,
  ): Promise<Array<{ amount: number; idempotency_key: string }>> {
    const { rows } = await app.databaseService.query<{
      amount: number;
      idempotency_key: string;
    }>(
      `SELECT amount, idempotency_key FROM public.credit_ledger
       WHERE tenant_id = $1 AND transaction_type = 'expiry' ORDER BY recorded_at`,
      [tenantId],
    );
    return rows;
  }

  const balance = (tenantId: string): Promise<number> =>
    credits.getBalance(tenantId, { tenant: { tenantId, schema: 'public' } });

  it('a lapsed grant takes out only its unspent part; purchased credits stay', async () => {
    const tenant = await createTestTenant(app.module);
    await record(tenant.id, 'purchase', 100, 10);
    const grant = await record(tenant.id, 'grant', 50, 9, -2);
    await record(tenant.id, 'deduction', -30, 5);
    // Until the job runs, the lapsed grant's remainder still counts
    expect(await balance(tenant.id)).toBe(120);

    await app.module.get(CreditExpiryHandler).execute();

    // The 30 spent came from the grant (it expired first): 20 of it lapsed
    expect(await expiryRows(tenant.id)).toEqual([
      { amount: -20, idempotency_key: `credit-expiry:${grant}` },
    ]);
    expect(await balance(tenant.id)).toBe(100);

    await app.module.get(CreditExpiryHandler).execute();
    expect(await expiryRows(tenant.id)).toHaveLength(1);
    expect(await balance(tenant.id)).toBe(100);
  });

  it('a fully spent grant is settled with nothing taken; a live grant and other tenants are untouched', async () => {
    const spent = await createTestTenant(app.module);
    await record(spent.id, 'purchase', 100, 10);
    const used = await record(spent.id, 'grant', 50, 9, -1);
    await record(spent.id, 'deduction', -70, 5);
    const live = await createTestTenant(app.module);
    await record(live.id, 'grant', 50, 1, 5);

    await app.module.get(CreditExpiryHandler).execute();

    expect(await expiryRows(spent.id)).toEqual([
      { amount: 0, idempotency_key: `credit-expiry:${used}` },
    ]);
    expect(await balance(spent.id)).toBe(80);
    expect(await expiryRows(live.id)).toEqual([]);
    expect(await balance(live.id)).toBe(50);
  });
});

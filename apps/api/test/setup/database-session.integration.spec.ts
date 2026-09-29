import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Every pooled connection the app opens (as app_login) carries the statement and
 * idle-in-transaction timeouts, so a runaway query or a transaction left open around a hung
 * external call is ended by Postgres instead of holding the connection and its locks.
 */
describe('Database sessions', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  const setting = async (name: string): Promise<string> =>
    (await app.appDatabaseService.query<Record<string, string>>(`SHOW ${name}`))
      .rows[0][name];

  it('have a statement timeout and an idle-in-transaction timeout', async () => {
    expect(await setting('statement_timeout')).toBe('15s');
    expect(await setting('idle_in_transaction_session_timeout')).toBe('30s');
  });

  it('apply to transactions too', async () => {
    const value = await app.appDatabaseService.transaction(async (client) => {
      const { rows } = await client.query<{ statement_timeout: string }>(
        'SHOW statement_timeout',
      );
      return rows[0].statement_timeout;
    });
    expect(value).toBe('15s');
  });
});

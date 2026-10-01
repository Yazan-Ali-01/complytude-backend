import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const SEEDS_DIR = resolve(__dirname, '../../../../scripts/seeds');

/**
 * Every seed loads, in order, as `run-seeds.sh development` loads them; and the demo labour-law
 * ruleset (and its precomputed chunks) belong to the labour ministry, not to Dubai's DED.
 */
describe('Seeds (development)', () => {
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

  it('load in order, with the demo labour ruleset under MOHRE', async () => {
    const files = readdirSync(SEEDS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      await app.databaseService.query(
        `SET complytude.allow_fixtures = 'on';\n${readFileSync(join(SEEDS_DIR, file), 'utf8')}\nRESET complytude.allow_fixtures;`,
      );
    }

    const { rows: ruleset } = await app.databaseService.query<{
      code: string;
    }>(
      `SELECT a.code FROM public.rulesets r
       JOIN public.authorities a ON a.id = r.authority_id
       WHERE r.key = 'uae_labour_law_employment_v1'`,
    );
    expect(ruleset).toEqual([{ code: 'MOHRE' }]);

    const { rows: chunks } = await app.databaseService.query<{
      authority: string;
    }>(
      `SELECT DISTINCT c.metadata->>'authorityName' AS authority
       FROM public.ruleset_chunks c
       JOIN public.rulesets r ON r.id = c.ruleset_id
       WHERE r.key = 'uae_labour_law_employment_v1'`,
    );
    expect(chunks).toEqual([
      { authority: 'Ministry of Human Resources and Emiratisation' },
    ]);
  });
});

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SEEDS_DIR = join(REPO_ROOT, 'scripts', 'seeds');
const REFERENCE_SEEDS = ['001_seed_authorities.sql', '002_seed_categories.sql'];
const FIXTURE_SEEDS = [
  '003_seed_test_tenants_users.sql',
  '004_seed_templates.sql',
  '005_seed_test_documents.sql',
  '006_seed_features_plans.sql',
  '007_seed_test_subscriptions.sql',
  '008_seed_test_entitlements.sql',
  '009_seed_rulesets.sql',
  '010_seed_ruleset_chunks.sql',
];

/** `run-seeds.sh --list` output as { run, skip } file lists; it exits before touching a database. */
function seedPlan(
  environment: string,
  nodeEnv: string | undefined,
): { run: string[]; skip: string[] } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_ENV;
  if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
  const out = execFileSync(
    'bash',
    ['scripts/run-seeds.sh', environment, '--list'],
    { cwd: REPO_ROOT, env, encoding: 'utf8' },
  );
  const files = (prefix: string): string[] =>
    out
      .split('\n')
      .filter((line) => line.startsWith(prefix))
      .map((line) => line.slice(prefix.length).trim().split(' ')[0]);
  return { run: files('run:'), skip: files('skip:') };
}

describe('Seed policy: reference data everywhere, test fixtures only in development/test', () => {
  it.each([
    ['production', undefined],
    ['staging', undefined],
    ['production', 'production'],
    ['development', 'production'],
    ['test', 'staging'],
  ])(
    'loads no test fixtures for environment %s with NODE_ENV=%s',
    (environment, nodeEnv) => {
      expect(seedPlan(environment, nodeEnv)).toEqual({
        run: REFERENCE_SEEDS,
        skip: FIXTURE_SEEDS,
      });
    },
  );

  it.each([
    ['development', undefined],
    ['development', 'development'],
    ['test', 'test'],
  ])(
    'loads fixtures for environment %s with NODE_ENV=%s',
    (environment, nodeEnv) => {
      expect(seedPlan(environment, nodeEnv)).toEqual({
        run: [...REFERENCE_SEEDS, ...FIXTURE_SEEDS],
        skip: [],
      });
    },
  );

  it('rejects an unknown environment instead of guessing', () => {
    expect(() => seedPlan('prod', undefined)).toThrow();
  });

  it('lists every seed file in the directory as either reference or fixture', () => {
    const { run } = seedPlan('development', 'development');
    const onDisk = execFileSync('ls', [SEEDS_DIR], { encoding: 'utf8' })
      .split('\n')
      .filter((name) => name.endsWith('.sql'));
    expect([...run].sort()).toEqual(onDisk.sort());
  });

  describe('the published-password fixture (003) against a database', () => {
    let app: TestApp;
    const fixture = readFileSync(
      join(SEEDS_DIR, '003_seed_test_tenants_users.sql'),
      'utf8',
    );

    beforeAll(async () => {
      app = await createTestApp();
    }, 60000);

    beforeEach(async () => {
      await resetTestState(app.databaseService, app.redisClient);
    }, 15000);

    afterAll(async () => {
      if (app) await app.cleanup();
    }, 30000);

    async function seededUsers(): Promise<number> {
      const result = await app.databaseService.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.users WHERE email LIKE '%.test'`,
      );
      return Number(result.rows[0].count);
    }

    it('refuses to run when loaded directly, creating no accounts', async () => {
      await expect(app.databaseService.query(fixture)).rejects.toThrow(
        /published password/,
      );
      expect(await seededUsers()).toBe(0);
    });

    it('runs when run-seeds.sh allows fixtures (complytude.allow_fixtures=on)', async () => {
      await app.databaseService.query(
        `SET complytude.allow_fixtures = 'on';\n${fixture}\nRESET complytude.allow_fixtures;`,
      );
      expect(await seededUsers()).toBeGreaterThan(0);
    });
  });
});

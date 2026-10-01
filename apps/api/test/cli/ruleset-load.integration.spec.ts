import {
  getQueueToken,
  QUEUE_NAMES,
  QueueProducerService,
  type Queue,
} from '@lib/queue';
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  RulesetFileError,
  RulesetLoadService,
} from 'src/cli/rulesets/ruleset-load.service';
import { AuthorityRepository } from 'src/repositories/authorities/authority.repository';
import { RulesetVersionRepository } from 'src/repositories/rulesets/ruleset-version.repository';
import { RulesetRepository } from 'src/repositories/rulesets/ruleset.repository';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const RULESETS = resolve(__dirname, '../../../../data/rulesets');
const FILES = readdirSync(RULESETS).filter((file) => file.endsWith('.json'));

/**
 * `pnpm rulesets:load` creates the rulesets in data/rulesets (inactive, queued for ingestion), adds
 * a new version only when a file's clauses change, and writes nothing if any file is invalid.
 */
describe('Loading ruleset files (rulesets:load)', () => {
  let app: TestApp;
  let loader: RulesetLoadService;
  let queue: Queue;
  let dir: string;

  beforeAll(async () => {
    app = await createTestApp();
    // As the CLI runs: the app login, and its platform login for the writes
    const db = app.appDatabaseService;
    loader = new RulesetLoadService(
      db,
      new RulesetRepository(db),
      new RulesetVersionRepository(db),
      new AuthorityRepository(db),
      app.module.get(QueueProducerService),
    );
    queue = app.module.get<Queue>(getQueueToken(QUEUE_NAMES.DATA_INGESTION));
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await queue.obliterate({ force: true });
    dir = mkdtempSync(join(tmpdir(), 'rulesets-'));
  }, 15000);

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function versionsOf(
    key: string,
  ): Promise<Array<{ version: string; is_active: boolean }>> {
    const { rows } = await app.databaseService.query<{
      version: string;
      is_active: boolean;
    }>(
      `SELECT v.version, v.is_active FROM public.ruleset_versions v
       JOIN public.rulesets r ON r.id = v.ruleset_id
       WHERE r.key = $1 ORDER BY v.created_at`,
      [key],
    );
    return rows;
  }

  it('creates every ruleset in data/rulesets, inactive and queued for ingestion, once', async () => {
    const first = await loader.load(RULESETS);

    expect(first).toHaveLength(FILES.length);
    expect(first.every((ruleset) => ruleset.outcome === 'created')).toBe(true);
    const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized']);
    expect(
      jobs.map((job) => (job.data as { versionId: string }).versionId),
    ).toEqual(expect.arrayContaining(first.map((r) => r.versionId)));
    expect(await versionsOf('uae_federal_labour_law')).toEqual([
      { version: '1.0.0', is_active: false },
    ]);
    // Authorities are created from the files' codes when missing
    const { rows } = await app.databaseService.query<{ name: string }>(
      `SELECT name FROM public.authorities WHERE code = 'MOHRE'`,
    );
    expect(rows).toEqual([
      { name: 'Ministry of Human Resources and Emiratisation' },
    ]);

    // Loading the same files again changes nothing
    const second = await loader.load(RULESETS);
    expect(second.every((ruleset) => ruleset.outcome === 'unchanged')).toBe(
      true,
    );
    expect(
      await queue.getJobs(['waiting', 'delayed', 'prioritized']),
    ).toHaveLength(FILES.length);
  });

  it('adds a new minor version when a file’s clauses change', async () => {
    const file = 'dmcc_employment_rules.json';
    copyFileSync(join(RULESETS, file), join(dir, file));
    await loader.load(dir);

    const ruleset = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      clauses: Array<{ content: string }>;
    };
    ruleset.clauses[0].content += ' (amended)';
    writeFileSync(join(dir, file), JSON.stringify(ruleset));

    const [loaded] = await loader.load(dir);
    expect(loaded).toMatchObject({
      key: 'dmcc_employment_rules',
      outcome: 'new-version',
      version: '1.1.0',
    });
    expect(await versionsOf('dmcc_employment_rules')).toEqual([
      { version: '1.0.0', is_active: false },
      { version: '1.1.0', is_active: false },
    ]);
  });

  it('writes nothing when any file is invalid', async () => {
    copyFileSync(
      join(RULESETS, 'dmcc_employment_rules.json'),
      join(dir, 'a.json'),
    );
    const bad = JSON.parse(
      readFileSync(join(RULESETS, 'adgm_employment_regulations.json'), 'utf8'),
    ) as { clauses: Array<{ severity: string }> };
    bad.clauses[0].severity = 'urgent';
    writeFileSync(join(dir, 'b.json'), JSON.stringify(bad));

    await expect(loader.load(dir)).rejects.toThrow(RulesetFileError);
    await expect(loader.load(dir)).rejects.toThrow(
      /b\.json: clauses\.0\.severity/,
    );
    const { rows } = await app.databaseService.query(
      'SELECT 1 FROM public.rulesets',
    );
    expect(rows).toHaveLength(0);
  });
});

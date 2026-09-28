import { randomUUID } from 'node:crypto';
import { RulesetsService } from 'src/modules/rulesets/rulesets.service';
import { RulesetChunkSearchRepository } from '../../../worker-ai/src/repositories/ruleset-chunk-search.repository';
import { createTestUser } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const DIMENSIONS = 1536;

/** A unit vector along `axis`: chunks on the same axis as the query are nearest. */
function vector(axis: number): number[] {
  const v = new Array<number>(DIMENSIONS).fill(0);
  v[axis] = 1;
  return v;
}

/**
 * Retrieval reads only active rulesets and their active version (a retired regulation or a
 * superseded version is never cited), finds Arabic clauses lexically, and a scoped search
 * still returns its rulesets' clauses among many others. Real schema and pgvector.
 */
describe('Ruleset retrieval', () => {
  let app: TestApp;
  let search: RulesetChunkSearchRepository;
  let rulesets: RulesetsService;

  beforeAll(async () => {
    app = await createTestApp();
    search = new RulesetChunkSearchRepository(app.appDatabaseService);
    rulesets = app.module.get(RulesetsService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await app.databaseService.query('DELETE FROM public.ruleset_chunks');
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  let nextIndex = 0;

  async function ruleset(): Promise<{
    id: string;
    key: string;
    versionId: string;
  }> {
    const key = `rules_${randomUUID().slice(0, 8)}`;
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.rulesets (key, name, current_version) VALUES ($1, 'Rules', '1.0.0') RETURNING id`,
      [key],
    );
    const { rows: v } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.ruleset_versions (ruleset_id, version) VALUES ($1, '1.0.0') RETURNING id`,
      [rows[0].id],
    );
    return { id: rows[0].id, key, versionId: v[0].id };
  }

  async function chunk(
    rulesetId: string,
    versionId: string,
    content: string,
    axis: number,
  ): Promise<string> {
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.ruleset_chunks (ruleset_id, ruleset_version_id, chunk_index, content, embedding)
       VALUES ($1, $2, $5, $3, $4::vector) RETURNING id`,
      [
        rulesetId,
        versionId,
        content,
        `[${vector(axis).join(',')}]`,
        nextIndex++,
      ],
    );
    return rows[0].id;
  }

  async function retrieve(
    axis: number,
    text = 'working hours',
    rulesetIds?: string[],
  ): Promise<string[]> {
    const matches = await search.hybridSearchBatch(
      [vector(axis)],
      text,
      5,
      30,
      30,
      40,
      rulesetIds,
    );
    return matches.map((m) => m.content);
  }

  it('stops returning a ruleset as soon as it is deactivated', async () => {
    const labour = await ruleset();
    const other = await ruleset();
    await chunk(labour.id, labour.versionId, 'Labour: working hours', 1);
    await chunk(other.id, other.versionId, 'Other: data protection', 2);
    expect(await retrieve(1)).toContain('Labour: working hours');

    await rulesets.deactivate(labour.key);

    expect(await retrieve(1)).not.toContain('Labour: working hours');
    expect(await retrieve(1)).toContain('Other: data protection');
  });

  it('a new version replaces the old one in results at once, before its re-ingestion clears it', async () => {
    const labour = await ruleset();
    await chunk(labour.id, labour.versionId, 'v1: 60 hours a week', 1);
    jest
      .spyOn(app.queueProducerService, 'enqueue')
      .mockResolvedValue({} as never);

    const author = await createTestUser(app.module);
    const v2 = await rulesets.createVersion(
      labour.key,
      { version: '2.0.0', clauses: [] } as never,
      author.id,
    );
    await chunk(labour.id, v2.id, 'v2: 48 hours a week', 1);

    expect(await retrieve(1)).toEqual(['v2: 48 hours a week']);
    const { rows } = await app.databaseService.query<{ version: string }>(
      'SELECT version FROM public.ruleset_versions WHERE ruleset_id = $1 AND is_active',
      [labour.id],
    );
    expect(rows).toEqual([{ version: '2.0.0' }]);
    jest.restoreAllMocks();
  });

  it('matches Arabic clauses lexically, by stem', async () => {
    const labour = await ruleset();
    // Vector far from the query: only BM25 can find it
    await chunk(labour.id, labour.versionId, 'إجازة الموظفين السنوية', 9);
    // Nearer the query by vector: without an Arabic lexical match it would rank first
    await chunk(
      labour.id,
      labour.versionId,
      'Unrelated clause about parking',
      1,
    );

    // "للموظفين" and "الموظفين" share the stem موظف; only Arabic stemming connects them
    const found = await retrieve(1, 'عقد للموظفين');

    expect(found[0]).toBe('إجازة الموظفين السنوية');
  });

  it('a scoped search returns its own clauses even among many closer ones', async () => {
    const crowded = await ruleset();
    const scoped = await ruleset();
    for (let i = 0; i < 200; i++) {
      await chunk(crowded.id, crowded.versionId, `Crowded clause ${i}`, 1);
    }
    await chunk(scoped.id, scoped.versionId, 'Scoped A', 5);
    await chunk(scoped.id, scoped.versionId, 'Scoped B', 6);

    expect((await retrieve(1, 'nothing matches', [scoped.id])).sort()).toEqual([
      'Scoped A',
      'Scoped B',
    ]);
  });
});

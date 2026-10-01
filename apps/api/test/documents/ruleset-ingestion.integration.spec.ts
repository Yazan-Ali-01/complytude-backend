import {
  ClauseChunkerService,
  TextChunkerService,
  TokenCounterService,
} from '@lib/embedding';
import type { EmbeddingService } from '@lib/embedding';
import {
  getQueueToken,
  QUEUE_NAMES,
  QueueProducerService,
  type Queue,
} from '@lib/queue';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RulesetReingestService } from 'src/cli/rulesets/ruleset-reingest.service';
import { RulesetVersionRepository } from 'src/repositories/rulesets/ruleset-version.repository';
import { RulesetChunksRepository } from '../../../worker-ingestion/src/repositories/ruleset-chunks.repository';
import { RulesetVersionStatusRepository } from '../../../worker-ingestion/src/repositories/ruleset-version-status.repository';
import { RulesetVersionReadRepository } from '../../../worker-ingestion/src/repositories/ruleset-version-read.repository';
import { RulesetIngestionService } from '../../../worker-ingestion/src/services/ruleset-ingestion.service';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Ruleset ingestion keeps each clause's own facts (mandatory, severity, article) on its chunks,
 * which citations and baseline severity are built from; and the re-ingest command queues every
 * active version so existing chunks can be rebuilt.
 */
describe('Ruleset ingestion metadata and re-ingestion', () => {
  let app: TestApp;
  const tokenCounter = new TokenCounterService();

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await app.module
      .get<Queue>(getQueueToken(QUEUE_NAMES.DATA_INGESTION))
      .obliterate({ force: true });
  }, 15000);

  afterAll(async () => {
    tokenCounter.onModuleDestroy();
    if (app) await app.cleanup();
  }, 30000);

  const CLAUSES = [
    {
      id: 'lab_08',
      title: 'Written Employment Contract',
      content: 'Every employment relationship must be documented in writing.',
      order: 1,
      is_required: true,
      metadata: { article: 'Art. 8', severity: 'critical' },
    },
    {
      id: 'lab_65',
      title: 'Housing Allowance',
      content: 'Employers are encouraged to state any housing allowance.',
      order: 2,
      metadata: {
        section: 'Section 4',
        severity: 'medium',
        source_document: 'Guide',
      },
    },
  ];

  async function ruleset(
    active = true,
  ): Promise<{ rulesetId: string; versionId: string }> {
    const { rows: authority } = await app.databaseService.query<{
      id: string;
    }>(
      `INSERT INTO public.authorities (code, name) VALUES ($1, 'Ministry of Human Resources and Emiratisation') RETURNING id`,
      [`MOHRE_${randomUUID().slice(0, 8)}`],
    );
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.rulesets (key, name, authority_id, current_version)
       VALUES ($1, 'UAE Labour Law', $2, '1.0.0') RETURNING id`,
      [`labour_${randomUUID().slice(0, 8)}`, authority[0].id],
    );
    const { rows: version } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.ruleset_versions (ruleset_id, version, clauses, is_active)
       VALUES ($1, '1.0.0', $2::jsonb, $3) RETURNING id`,
      [rows[0].id, JSON.stringify(CLAUSES), active],
    );
    return { rulesetId: rows[0].id, versionId: version[0].id };
  }

  it('stores whether a clause is required, its severity, article, section and source on every chunk', async () => {
    const { rulesetId, versionId } = await ruleset();
    const ingestion = new RulesetIngestionService(
      app.databaseService,
      new RulesetVersionReadRepository(app.databaseService),
      new RulesetChunksRepository(app.databaseService),
      new RulesetVersionStatusRepository(app.databaseService),
      new ClauseChunkerService(
        tokenCounter,
        new TextChunkerService(tokenCounter),
      ),
      {
        getModel: () => 'text-embedding-3-large',
        generateEmbeddings: (texts: string[]) =>
          Promise.resolve(
            texts.map((_text, index) => ({
              embedding: new Array<number>(1536).fill(0).fill(1, 0, 1),
              index,
              tokenCount: 1,
            })),
          ),
      } as unknown as EmbeddingService,
      new ConfigService({ workerIngestion: { batchSize: 500 } }),
    );

    await ingestion.ingest({ rulesetId, versionId });

    const { rows } = await app.databaseService.query<{
      metadata: Record<string, unknown>;
      embedding_model: string;
    }>(
      'SELECT metadata, embedding_model FROM public.ruleset_chunks WHERE ruleset_version_id = $1 ORDER BY chunk_index',
      [versionId],
    );
    // Each chunk names the model behind its vector, so retrieval never compares across models
    expect(rows.map((r) => r.embedding_model)).toEqual([
      'text-embedding-3-large',
      'text-embedding-3-large',
    ]);
    expect(rows.map((r) => r.metadata)).toEqual([
      expect.objectContaining({
        clauseId: 'lab_08',
        isRequired: true,
        severity: 'critical',
        article: 'Art. 8',
        section: null,
        source: null,
        rulesetName: 'UAE Labour Law',
        authorityName: 'Ministry of Human Resources and Emiratisation',
        version: '1.0.0',
      }),
      expect.objectContaining({
        clauseId: 'lab_65',
        isRequired: false,
        severity: 'medium',
        article: null,
        section: 'Section 4',
        source: 'Guide',
      }),
    ]);
  });

  it('the re-ingest command queues one ingestion per active version, none for an inactive one', async () => {
    const first = await ruleset();
    const second = await ruleset();
    const retired = await ruleset(false);

    const queued = await new RulesetReingestService(
      new RulesetVersionRepository(app.databaseService),
      app.module.get(QueueProducerService),
    ).reingestActiveVersions();

    const jobs = await app.module
      .get<Queue>(getQueueToken(QUEUE_NAMES.DATA_INGESTION))
      .getJobs(['waiting', 'delayed', 'prioritized']);
    const versionIds = jobs.map(
      (job) => (job.data as { versionId: string }).versionId,
    );
    expect(queued.map((q) => q.versionId)).toEqual(
      expect.arrayContaining([first.versionId, second.versionId]),
    );
    expect(versionIds).toEqual(
      expect.arrayContaining([first.versionId, second.versionId]),
    );
    expect(versionIds).not.toContain(retired.versionId);
  });
});

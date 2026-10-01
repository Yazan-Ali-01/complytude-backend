import {
  ClauseChunkerService,
  TextChunkerService,
  TokenCounterService,
  type EmbeddingService,
} from '@lib/embedding';
import { ConfigService } from '@nestjs/config';
import type { FastifyInstance } from 'fastify';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { RulesetChunksRepository } from '../../../worker-ingestion/src/repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from '../../../worker-ingestion/src/repositories/ruleset-version-read.repository';
import { RulesetVersionStatusRepository } from '../../../worker-ingestion/src/repositories/ruleset-version-status.repository';
import { RulesetIngestionService } from '../../../worker-ingestion/src/services/ruleset-ingestion.service';
import { createTestUser } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

type Headers = Record<string, string | string[] | undefined>;

const RULESETS = resolve(__dirname, '../../../../data/rulesets');
/** Summarised text in the old file shape, kept until its verbatim draft replaces it. */
const NOT_VERBATIM = ['dmcc_company_regulations.json'];

interface RulesetFile {
  key: string;
  authority: { code: string; name: string };
  clauses: Array<{
    id: string;
    source_url?: string;
    effective_date?: string;
    article?: string;
    section?: string;
  }>;
  [field: string]: unknown;
}

const files = readdirSync(RULESETS).filter(
  (file) => file.endsWith('.json') && !NOT_VERBATIM.includes(file),
);

/**
 * The drafted rulesets in data/rulesets (verbatim text with its sources) are POST /rulesets
 * bodies, with the authority named by code: each one passes the API's validation, ingests, and
 * keeps its sources on every chunk. A draft whose clauses aren't all sourced can't be marked
 * reviewed until they are.
 */
describe('Ruleset files in data/rulesets', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let admin: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    const user = await createTestUser(app.module, {
      platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    admin = cookieHeaderFromSetCookie(login.headers as Headers);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  it('has at least one verbatim draft', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s loads, ingests and keeps its sources', async (file) => {
    const { authority, ...body } = JSON.parse(
      readFileSync(join(RULESETS, file), 'utf8'),
    ) as RulesetFile;
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.authorities (code, name) VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [authority.code, authority.name],
    );

    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/rulesets',
      headers: { cookie: admin },
      payload: { ...body, authority_id: rows[0].id },
    });
    expect(created.statusCode).toBe(201);
    const { id: versionId, rulesetId } = created.json<{
      createdVersion: { id: string; rulesetId: string };
    }>().createdVersion;

    const tokenCounter = new TokenCounterService();
    await new RulesetIngestionService(
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
    ).ingest({ rulesetId, versionId });
    tokenCounter.onModuleDestroy();

    const version = await server.inject({
      method: 'GET',
      url: `/api/v1/rulesets/${body.key}/versions/1.0.0`,
      headers: { cookie: admin },
    });
    expect(version.json()).toMatchObject({
      ingestionStatus: 'ingested',
      reviewStatus: 'draft',
    });
    const { rows: chunks } = await app.databaseService.query<{
      metadata: Record<string, unknown>;
    }>(
      'SELECT metadata FROM public.ruleset_chunks WHERE ruleset_version_id = $1',
      [versionId],
    );
    const clauseIds = new Set(chunks.map((c) => c.metadata.clauseId));
    expect(clauseIds.size).toBe(body.clauses.length);
    for (const chunk of chunks) {
      expect(chunk.metadata).toMatchObject({
        sourceUrl: expect.stringMatching(/^https:\/\//) as string,
        article: expect.any(String) as string,
      });
    }

    // Recording the legal review needs every clause's source, effective date and article
    const unsourced = body.clauses.filter(
      (clause) =>
        !clause.source_url ||
        !clause.effective_date ||
        !(clause.article || clause.section),
    );
    const review = await server.inject({
      method: 'POST',
      url: `/api/v1/rulesets/${body.key}/versions/1.0.0/review`,
      headers: { cookie: admin },
      payload: { reviewedBy: 'Test reviewer', reviewedAt: '2026-11-15' },
    });
    expect(review.statusCode).toBe(unsourced.length > 0 ? 409 : 200);
  });
});

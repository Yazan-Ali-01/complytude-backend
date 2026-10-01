import {
  ClauseChunkerService,
  TextChunkerService,
  TokenCounterService,
  type EmbeddingService,
} from '@lib/embedding';
import { PermanentError, type Job } from '@lib/queue';
import { ConfigService } from '@nestjs/config';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DataIngestionProcessor } from '../../../worker-ingestion/src/processors/data-ingestion.processor';
import { RulesetChunksRepository } from '../../../worker-ingestion/src/repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from '../../../worker-ingestion/src/repositories/ruleset-version-read.repository';
import { RulesetVersionStatusRepository } from '../../../worker-ingestion/src/repositories/ruleset-version-status.repository';
import type { DocumentIngestionService } from '../../../worker-ingestion/src/services/document-ingestion.service';
import { RulesetIngestionService } from '../../../worker-ingestion/src/services/ruleset-ingestion.service';
import {
  createTestSubscription,
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
  grantAiConsent,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

type Headers = Record<string, string | string[] | undefined>;

const CLAUSES = [
  {
    id: 'hours',
    title: 'Working hours',
    content: 'Working hours are at most 48 a week.',
    order: 1,
    is_required: true,
  },
];

/**
 * A ruleset version is usable only once its rules are ingested (N-024), and, where review is
 * required (always in production, D-9), once its legal review is recorded. Analyses never run
 * against rules that aren't ingested.
 */
describe('Ruleset versions: ingestion, review and activation', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let admin: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    admin = await login(
      (
        await createTestUser(app.module, {
          platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
        })
      ).email,
    );
  }, 15000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function login(email: string): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Test123!@#' },
    });
    expect(res.statusCode).toBe(200);
    return cookieHeaderFromSetCookie(res.headers as Headers);
  }

  function api(method: 'GET' | 'POST', url: string, payload?: object) {
    return server.inject({
      method,
      url: `/api/v1/rulesets${url}`,
      headers: { cookie: admin },
      ...(payload && { payload }),
    });
  }

  async function createRuleset(): Promise<{ key: string; versionId: string }> {
    const key = `labour_${randomUUID().slice(0, 8)}`;
    const created = await api('POST', '', {
      key,
      name: 'Labour',
      clauses: CLAUSES,
      jurisdictions: ['MAINLAND'],
      document_types: ['employment'],
    });
    expect(created.statusCode).toBe(201);
    return {
      key,
      versionId: created.json<{ createdVersion: { id: string } }>()
        .createdVersion.id,
    };
  }

  /** What worker-ingestion does with the job: chunk, embed (faked) and store. */
  function ingestion(): RulesetIngestionService {
    const db = app.databaseService;
    const tokenCounter = new TokenCounterService();
    return new RulesetIngestionService(
      db,
      new RulesetVersionReadRepository(db),
      new RulesetChunksRepository(db),
      new RulesetVersionStatusRepository(db),
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
  }

  async function ingest(key: string, versionId: string): Promise<void> {
    const { rows } = await app.databaseService.query<{ id: string }>(
      'SELECT id FROM public.rulesets WHERE key = $1',
      [key],
    );
    await ingestion().ingest({ rulesetId: rows[0].id, versionId });
  }

  function requireReview(): void {
    const config = app.module.get(ConfigService);
    const get = config.get.bind(config) as (key: string) => unknown;
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'RULESETS_REQUIRE_REVIEW' ? true : get(key),
      );
  }

  it("creates a version inactive, and won't activate it until its rules are ingested", async () => {
    const { key, versionId } = await createRuleset();

    const ruleset = await api('GET', `/${key}`);
    expect(ruleset.json()).toMatchObject({
      currentVersion: null,
      currentVersionData: null,
    });
    const version = await api('GET', `/${key}/versions/1.0.0`);
    expect(version.json()).toMatchObject({
      isActive: false,
      ingestionStatus: 'pending',
      reviewStatus: 'draft',
      chunkCount: null,
    });

    const refused = await api('POST', `/${key}/versions/1.0.0/activate`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ message: string }>().message).toMatch(/ingested/);

    await ingest(key, versionId);
    expect((await api('GET', `/${key}/versions/1.0.0`)).json()).toMatchObject({
      ingestionStatus: 'ingested',
      chunkCount: 1,
      ingestionError: null,
    });

    // Outside production a draft may be activated
    const activated = await api('POST', `/${key}/versions/1.0.0/activate`);
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({
      isActive: true,
      reviewStatus: 'draft',
    });
    expect((await api('GET', `/${key}`)).json()).toMatchObject({
      currentVersion: '1.0.0',
      currentVersionData: { version: '1.0.0', isActive: true },
    });
  });

  it('where review is required (production), activates a version only once its review is recorded', async () => {
    requireReview();
    const { key, versionId } = await createRuleset();
    await ingest(key, versionId);

    const refused = await api('POST', `/${key}/versions/1.0.0/activate`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ message: string }>().message).toMatch(/review/);

    const reviewed = await api('POST', `/${key}/versions/1.0.0/review`, {
      reviewedBy: 'Example Law Firm — A. Lawyer',
      reviewedAt: '2026-11-15',
      notes: 'Reviewed against the published consolidated text.',
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({
      reviewStatus: 'reviewed',
      reviewedBy: 'Example Law Firm — A. Lawyer',
      reviewedAt: '2026-11-15',
    });

    expect(
      (await api('POST', `/${key}/versions/1.0.0/activate`)).statusCode,
    ).toBe(200);
  });

  it('records a failed ingestion on the version, which then stays unusable', async () => {
    const { key, versionId } = await createRuleset();
    const processor = new DataIngestionProcessor(
      ingestion(),
      {} as DocumentIngestionService,
      new ConfigService(),
    ) as unknown as {
      onPermanentFailure(
        job: Job<unknown>,
        error: PermanentError,
      ): Promise<void>;
    };

    await processor.onPermanentFailure(
      {
        name: 'ruleset-ingestion',
        data: { rulesetId: 'r', versionId },
      } as Job<unknown>,
      new PermanentError('Ruleset version has no clauses'),
    );

    expect((await api('GET', `/${key}/versions/1.0.0`)).json()).toMatchObject({
      ingestionStatus: 'failed',
      ingestionError: 'Ruleset version has no clauses',
    });
    expect(
      (await api('POST', `/${key}/versions/1.0.0/activate`)).statusCode,
    ).toBe(409);

    // A retry that succeeds makes it usable; a later failed re-ingestion keeps its chunks
    await ingest(key, versionId);
    await processor.onPermanentFailure(
      {
        name: 'ruleset-ingestion',
        data: { rulesetId: 'r', versionId },
      } as Job<unknown>,
      new PermanentError('Embedding API refused the batch'),
    );
    expect((await api('GET', `/${key}/versions/1.0.0`)).json()).toMatchObject({
      ingestionStatus: 'ingested',
      chunkCount: 1,
      ingestionError: 'Embedding API refused the batch',
    });
  });

  it('never analyses against rules that are not ingested', async () => {
    const { key } = await createRuleset();
    // Even if the version were active, its rules aren't stored yet
    await app.databaseService.query(
      `UPDATE public.ruleset_versions SET is_active = true
       WHERE ruleset_id = (SELECT id FROM public.rulesets WHERE key = $1)`,
      [key],
    );
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    await grantAiConsent(app.module, tenant.id);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: await login(user.email) },
      payload: { tenantId: tenant.id },
    });
    const cookie = cookieHeaderFromSetCookie(switched.headers as Headers);
    const analyze = (scope: object) =>
      server.inject({
        method: 'POST',
        url: '/api/v1/documents/analyze',
        headers: { cookie },
        payload: {
          title: 'Contract',
          content: 'Work 60 hours a week.',
          ...scope,
        },
      });

    const byScope = await analyze({
      jurisdiction: 'MAINLAND',
      documentType: 'employment',
    });
    expect(byScope.statusCode).toBe(400);
    const byKey = await analyze({ rulesetKeys: [key] });
    expect(byKey.statusCode).toBe(400);
    expect(byKey.json<{ message: string }>().message).toContain(key);
    const { rows } = await app.databaseService.query(
      'SELECT 1 FROM public.analysis_jobs WHERE tenant_id = $1',
      [tenant.id],
    );
    expect(rows).toHaveLength(0);
  });
});

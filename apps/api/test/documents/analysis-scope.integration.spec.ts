import {
  getQueueToken,
  QUEUE_NAMES,
  type DocumentAnalysisJobData,
  type Queue,
} from '@lib/queue';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { RulesetChunkSearchRepository } from '../../../worker-ai/src/repositories/ruleset-chunk-search.repository';
import {
  createTestSubscription,
  grantAiConsent,
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
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
 * An analysis is checked against the rulesets that apply to the contract: the ones tagged with
 * its jurisdiction and document type, or the ones picked explicitly. Never every ruleset, and
 * never none: without a scope, or when nothing applies, the request is refused.
 */
describe('Analysis scope: jurisdiction and document type', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let aiQueue: Queue;

  const ONSHORE = [
    'MAINLAND',
    'DMCC',
    'IFZA',
    'RAKEZ',
    'SHAMS',
    'DAFZA',
    'JAFZA',
  ];
  let labour: { id: string; key: string };
  let difc: { id: string; key: string };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    aiQueue = app.module.get<Queue>(getQueueToken(QUEUE_NAMES.AI_PROCESSING));
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await app.databaseService.query('DELETE FROM public.ruleset_chunks');
    await app.databaseService.query('DELETE FROM public.ruleset_versions');
    await app.databaseService.query('DELETE FROM public.rulesets');
    labour = await ruleset(
      ONSHORE,
      ['employment'],
      'Working hours are at most 48 a week.',
      1,
    );
    difc = await ruleset(
      ['DIFC'],
      ['employment'],
      'DIFC working hours are at most 40 a week.',
      2,
    );
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** An active ruleset with one ingested chunk on its own vector axis. */
  async function ruleset(
    jurisdictions: string[],
    documentTypes: string[],
    clause: string,
    axis: number,
  ): Promise<{ id: string; key: string }> {
    const key = `rules_${randomUUID().slice(0, 8)}`;
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.rulesets (key, name, jurisdictions, document_types)
       VALUES ($1, 'Rules', $2, $3) RETURNING id`,
      [key, jurisdictions, documentTypes],
    );
    const { rows: version } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.ruleset_versions (ruleset_id, version) VALUES ($1, '1.0.0') RETURNING id`,
      [rows[0].id],
    );
    await app.databaseService.query(
      `INSERT INTO public.ruleset_chunks (ruleset_id, ruleset_version_id, chunk_index, content, embedding, embedding_model)
       VALUES ($1, $2, 0, $3, $4::vector, 'text-embedding-3-large')`,
      [rows[0].id, version[0].id, clause, `[${vector(axis).join(',')}]`],
    );
    return { id: rows[0].id, key };
  }

  async function login(email: string): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Test123!@#' },
    });
    expect(res.statusCode).toBe(200);
    return cookieHeaderFromSetCookie(
      res.headers as Record<string, string | string[] | undefined>,
    );
  }

  /** A Shield tenant's admin, signed in to the tenant. */
  async function tenantAdmin(): Promise<{ tenantId: string; cookie: string }> {
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
    expect(switched.statusCode).toBe(200);
    return {
      tenantId: tenant.id,
      cookie: cookieHeaderFromSetCookie(
        switched.headers as Record<string, string | string[] | undefined>,
      ),
    };
  }

  async function queued(
    analysisJobId: string,
  ): Promise<DocumentAnalysisJobData> {
    const job = await aiQueue.getJob(`doc-analysis-${analysisJobId}`);
    expect(job).toBeDefined();
    return job!.data as DocumentAnalysisJobData;
  }

  async function jobsOf(tenantId: string): Promise<number> {
    const { rows } = await app.databaseService.query(
      'SELECT 1 FROM public.analysis_jobs WHERE tenant_id = $1',
      [tenantId],
    );
    return rows.length;
  }

  it('checks a DIFC employment contract against the DIFC rules only, never mainland labour law', async () => {
    const { cookie } = await tenantAdmin();

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: { cookie },
      payload: {
        title: 'Employment contract',
        content: 'The employee works 50 hours a week at Gate Village, DIFC.',
        jurisdiction: 'DIFC',
        documentType: 'employment',
      },
    });

    expect(res.statusCode).toBe(202);
    const data = await queued(
      res.json<{ analysisJobId: string }>().analysisJobId,
    );
    expect(data).toMatchObject({
      rulesetIds: [difc.id],
      jurisdiction: 'DIFC',
      documentType: 'employment',
    });
    // The worker's search, scoped as queued, can't return the labour-law clause even for a
    // query nearest to it
    const matches = await new RulesetChunkSearchRepository(
      app.appDatabaseService,
    ).hybridSearchBatch(
      [vector(1)],
      'working hours a week',
      5,
      30,
      30,
      40,
      data.rulesetIds,
      'text-embedding-3-large',
    );
    expect(matches.map((m) => m.rulesetId)).toEqual([difc.id]);
  });

  it('trigger-analysis takes the same scope, and refuses to run without one', async () => {
    const { tenantId, cookie } = await tenantAdmin();
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, content, source_type, extraction_status, s3_key, s3_bucket)
       VALUES ($1, 'Uploaded contract', 'The employee works 60 hours a week.', 'file_upload', 'completed', $2, 'complytude-files')
       RETURNING id`,
      [tenantId, `tenants/${tenantId}/documents/${randomUUID()}/contract.pdf`],
    );
    const trigger = (payload: object) =>
      server.inject({
        method: 'POST',
        url: `/api/v1/documents/${rows[0].id}/trigger-analysis`,
        headers: { cookie },
        payload,
      });

    for (const payload of [
      {},
      { jurisdiction: 'MAINLAND' },
      { documentType: 'employment' },
    ]) {
      const refused = await trigger(payload);
      expect(refused.statusCode).toBe(400);
    }
    expect(await jobsOf(tenantId)).toBe(0);

    const byType = await trigger({
      jurisdiction: 'MAINLAND',
      documentType: 'employment',
    });
    expect(byType.statusCode).toBe(202);
    expect(
      await queued(byType.json<{ analysisJobId: string }>().analysisJobId),
    ).toMatchObject({
      rulesetIds: [labour.id],
      jurisdiction: 'MAINLAND',
      documentType: 'employment',
    });

    const picked = await trigger({ rulesetKeys: [difc.key] });
    expect(picked.statusCode).toBe(202);
    const pickedData = await queued(
      picked.json<{ analysisJobId: string }>().analysisJobId,
    );
    expect(pickedData.rulesetIds).toEqual([difc.id]);
    expect(pickedData).not.toHaveProperty('jurisdiction');
  });

  it('refuses a jurisdiction and document type that no active ruleset applies to, or an unknown code', async () => {
    const { tenantId, cookie } = await tenantAdmin();

    const nothing = await server.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: { cookie },
      payload: {
        title: 'Contract',
        content: 'Some text',
        jurisdiction: 'ADGM',
        documentType: 'employment',
      },
    });
    expect(nothing.statusCode).toBe(400);
    expect(JSON.stringify(nothing.json())).toContain('ADGM');

    const unknown = await server.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: { cookie },
      payload: {
        title: 'Contract',
        content: 'Some text',
        jurisdiction: 'MARS',
        documentType: 'employment',
      },
    });
    expect(unknown.statusCode).toBe(400);
    expect(await jobsOf(tenantId)).toBe(0);
  });

  it('a platform admin tags a ruleset with valid codes only', async () => {
    const cookie = await login(
      (
        await createTestUser(app.module, {
          platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
        })
      ).email,
    );
    const clauses = [
      {
        id: 'c1',
        title: 'Hours',
        content: 'At most 48 hours.',
        order: 1,
        is_required: true,
      },
    ];

    const invalid = await server.inject({
      method: 'POST',
      url: '/api/v1/rulesets',
      headers: { cookie },
      payload: {
        key: 'tagged_bad',
        name: 'Rules',
        clauses,
        jurisdictions: ['MARS'],
      },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/rulesets',
      headers: { cookie },
      payload: {
        key: 'tagged_ok',
        name: 'Rules',
        clauses,
        jurisdictions: ['DMCC'],
        document_types: ['shareholders_agreement'],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      jurisdictions: ['DMCC'],
      documentTypes: ['shareholders_agreement'],
    });
  });
});

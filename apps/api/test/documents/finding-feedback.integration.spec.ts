import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DataRetentionSweepHandler } from 'src/modules/tenant-processing/handlers/data-retention-sweep.handler';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Users accept or dismiss the findings of an analysis; each decision is stored with the result's
 * model and prompt version so dismissal rates can be measured per prompt version and ruleset.
 */
describe('Finding feedback', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  const db = (): TestApp['databaseService'] => app.databaseService;

  async function signIn(
    tenantId: string,
    role: SystemTenantRole,
  ): Promise<string> {
    const { user } = await createTestUserInTenant(app.module, tenantId, {
      role,
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: {
        cookie: cookieHeaderFromSetCookie(
          login.headers as Record<string, string | string[] | undefined>,
        ),
      },
      payload: { tenantId },
    });
    expect(switched.statusCode).toBe(200);
    return cookieHeaderFromSetCookie(
      switched.headers as Record<string, string | string[] | undefined>,
    );
  }

  /** A tenant with a completed analysis holding one finding, and a member and a viewer. */
  async function analysed(): Promise<{
    tenantId: string;
    documentId: string;
    jobId: string;
    findingId: string;
    member: string;
    viewer: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'general_counsel',
    });
    const member = await signIn(tenant.id, SystemTenantRole.MEMBER);
    const viewer = await signIn(tenant.id, SystemTenantRole.VIEWER);
    const {
      rows: [document],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, source_type, content, created_by)
       VALUES ($1, 'Employment contract', 'text_input', 'Probation: 9 months',
               (SELECT user_id FROM public.user_tenants WHERE tenant_id = $1 LIMIT 1))
       RETURNING id`,
      [tenant.id],
    );
    const findingId = randomUUID();
    const result = {
      model: 'gpt-test',
      provenance: { promptVersion: 6 },
      findings: [
        {
          id: findingId,
          clauseId: 'C1',
          title: 'Probation too long',
          riskLevel: 'high',
          rulesetKey: 'uae-labour-law',
          chunkId: 'chunk-1',
        },
      ],
    };
    const {
      rows: [job],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.analysis_jobs (tenant_id, document_id, status, result)
       VALUES ($1, $2, 'completed', $3::jsonb) RETURNING id`,
      [tenant.id, document.id, JSON.stringify(result)],
    );
    return {
      tenantId: tenant.id,
      documentId: document.id,
      jobId: job.id,
      findingId,
      member,
      viewer,
    };
  }

  function review(
    cookie: string,
    jobId: string,
    findingId: string,
    payload: object,
  ): Promise<LightMyRequestResponse> {
    return server.inject({
      method: 'PATCH',
      url: `/api/v1/analysis-jobs/${jobId}/findings/${findingId}`,
      headers: { cookie },
      payload,
    });
  }

  async function feedbackRows(
    jobId: string,
  ): Promise<Record<string, unknown>[]> {
    const { rows } = await db().query(
      `SELECT finding_id, decision, reason, model, prompt_version, ruleset_key, chunk_id
       FROM public.analysis_finding_feedback WHERE analysis_job_id = $1`,
      [jobId],
    );
    return rows;
  }

  it('a member dismisses a finding with a reason; the decision carries the prompt version', async () => {
    const { jobId, findingId, member } = await analysed();

    const dismissed = await review(member, jobId, findingId, {
      decision: 'dismissed',
      reason: 'The contract is DIFC, not mainland',
    });

    expect(dismissed.statusCode).toBe(200);
    expect(dismissed.json()).toMatchObject({
      findingId,
      decision: 'dismissed',
      reason: 'The contract is DIFC, not mainland',
    });
    expect(await feedbackRows(jobId)).toEqual([
      {
        finding_id: findingId,
        decision: 'dismissed',
        reason: 'The contract is DIFC, not mainland',
        model: 'gpt-test',
        prompt_version: 6,
        ruleset_key: 'uae-labour-law',
        chunk_id: 'chunk-1',
      },
    ]);

    // A later decision replaces it, and the job shows it
    expect(
      (await review(member, jobId, findingId, { decision: 'accepted' }))
        .statusCode,
    ).toBe(200);
    expect(await feedbackRows(jobId)).toEqual([
      expect.objectContaining({ decision: 'accepted', reason: null }),
    ]);
    const job = await server.inject({
      method: 'GET',
      url: `/api/v1/analysis-jobs/${jobId}`,
      headers: { cookie: member },
    });
    expect(job.json<{ findingFeedback: unknown[] }>().findingFeedback).toEqual([
      expect.objectContaining({ findingId, decision: 'accepted' }),
    ]);
  });

  it('is refused to a viewer, to another organization, and for an unknown finding or decision', async () => {
    const { jobId, findingId, viewer, member } = await analysed();
    const other = await analysed();

    expect(
      (await review(viewer, jobId, findingId, { decision: 'dismissed' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await review(other.member, jobId, findingId, { decision: 'dismissed' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await review(member, jobId, randomUUID(), { decision: 'dismissed' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await review(member, jobId, findingId, { decision: 'maybe' }))
        .statusCode,
    ).toBe(400);
    expect(await feedbackRows(jobId)).toEqual([]);
  });

  it('erasing the document clears the reason but keeps the decision for the statistics', async () => {
    const { jobId, findingId, member, documentId } = await analysed();
    await review(member, jobId, findingId, {
      decision: 'dismissed',
      reason: 'Probation of 9 months is in the contract on purpose',
    });
    await db().query(
      `UPDATE public.documents SET deleted_at = now() - interval '31 days' WHERE id = $1`,
      [documentId],
    );

    await app.module.get(DataRetentionSweepHandler).execute();

    expect(await feedbackRows(jobId)).toEqual([
      expect.objectContaining({
        decision: 'dismissed',
        reason: null,
        prompt_version: 6,
      }),
    ]);
  });

  it('the queries documented in data/eval/README.md run and count the decision', async () => {
    const { jobId, findingId, member } = await analysed();
    await review(member, jobId, findingId, { decision: 'dismissed' });
    const readme = readFileSync(
      join(__dirname, '../../../../data/eval/README.md'),
      'utf8',
    );
    const section = readme.slice(readme.indexOf('## Production feedback'));
    const queries = [...section.matchAll(/```sql\n([\s\S]*?)```/g)].map(
      (match) => match[1],
    );
    expect(queries).toHaveLength(2);

    const [byPrompt, byClause] = await Promise.all(
      queries.map((sql) => db().query(sql)),
    );
    expect(byPrompt.rows).toEqual([
      expect.objectContaining({
        prompt_version: 6,
        ruleset_key: 'uae-labour-law',
        reviewed: '1',
        dismissed: '1',
      }),
    ]);
    // Fewer than 5 reviews: no clause listed yet
    expect(byClause.rows).toEqual([]);
  });
});

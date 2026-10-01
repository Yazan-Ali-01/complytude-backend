import {
  getQueueToken,
  QUEUE_NAMES,
  type Job,
  type EntitlementUsageRefundJobData,
  type Queue,
} from '@lib/queue';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import type { PlanKey } from 'src/common/constants/plan-entitlements.constant';
import { UsageRefundHandler } from 'src/modules/entitlements/processors/usage-refund.handler';
import { CreditLedgerService } from 'src/modules/entitlements/services/credit-ledger.service';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { DocumentPreviewService } from 'src/modules/documents/services/document-preview.service';
import {
  createTestSubscription,
  grantAiConsent,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const DIMENSIONS = 1536;

/**
 * Every paid operation is checked and counted (BILL-008, DOC-006, DOC-019, BILL-013): an AI
 * contract review uses `contract_reviews_per_month` (then 10 credits), an upload uses
 * `document_scans`, previews have a daily cap, and a burst can't get past a limit. Refused: 402
 * and nothing is created.
 */
describe('Paid operations are metered and gated', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await applicableRuleset();
  }, 15000);

  afterEach(async () => {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** An active mainland employment ruleset, so an analysis has something to check against. */
  async function applicableRuleset(): Promise<void> {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    vector[0] = 1;
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.rulesets (key, name, jurisdictions, document_types)
       VALUES ($1, 'Labour', ARRAY['MAINLAND'], ARRAY['employment']) RETURNING id`,
      [`labour_${randomUUID().slice(0, 8)}`],
    );
    const { rows: version } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.ruleset_versions (ruleset_id, version, ingestion_status) VALUES ($1, '1.0.0', 'ingested') RETURNING id`,
      [rows[0].id],
    );
    await app.databaseService.query(
      `INSERT INTO public.ruleset_chunks (ruleset_id, ruleset_version_id, chunk_index, content, embedding, embedding_model)
       VALUES ($1, $2, 0, 'Working hours are at most 48 a week.', $3::vector, 'text-embedding-3-large')`,
      [rows[0].id, version[0].id, `[${vector.join(',')}]`],
    );
  }

  /** A tenant on `plan`, with its admin signed in to it. */
  async function tenantAdmin(plan: PlanKey): Promise<{
    tenantId: string;
    userId: string;
    email: string;
    cookie: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: plan });
    await grantAiConsent(app.module, tenant.id);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
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
      payload: { tenantId: tenant.id },
    });
    expect(switched.statusCode).toBe(200);
    return {
      tenantId: tenant.id,
      userId: user.id,
      email: user.email,
      cookie: cookieHeaderFromSetCookie(
        switched.headers as Record<string, string | string[] | undefined>,
      ),
    };
  }

  function analyze(cookie: string) {
    return server.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: { cookie },
      payload: {
        title: 'Employment contract',
        content: 'The employee works 60 hours a week.',
        jurisdiction: 'MAINLAND',
        documentType: 'employment',
      },
    });
  }

  async function counts(
    tenantId: string,
  ): Promise<{ documents: number; jobs: number }> {
    const { rows } = await app.databaseService.query<{
      documents: number;
      jobs: number;
    }>(
      `SELECT (SELECT count(*)::int FROM public.documents WHERE tenant_id = $1) AS documents,
              (SELECT count(*)::int FROM public.analysis_jobs WHERE tenant_id = $1) AS jobs`,
      [tenantId],
    );
    return rows[0];
  }

  /** An uploaded PDF waiting for confirm-upload (the storage mock reports it at 2,048,576 bytes). */
  async function pendingUpload(tenantId: string): Promise<string> {
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.documents
         (tenant_id, title, source_type, s3_key, s3_bucket, original_filename, mime_type,
          file_size_bytes, extraction_status)
       VALUES ($1, 'lease.pdf', 'file_upload', $2, 'mock-quarantine-bucket', 'lease.pdf',
               'application/pdf', 2048576, 'pending')
       RETURNING id`,
      [tenantId, `tenants/${tenantId}/documents/${randomUUID()}/lease.pdf`],
    );
    return rows[0].id;
  }

  it('a free-plan tenant gets 1 review a month; the next answers 402 and creates nothing', async () => {
    const { tenantId, cookie } = await tenantAdmin('navigator');

    expect((await analyze(cookie)).statusCode).toBe(202);
    const before = await counts(tenantId);

    const refused = await analyze(cookie);

    expect(refused.statusCode).toBe(402);
    expect(refused.json()).toMatchObject({
      reason: 'quota_exceeded',
      feature: 'contract_reviews_per_month',
      limit: 1,
      used: 1,
      creditsAvailable: 0,
      upgradeUrl: '/plans',
    });
    expect(refused.json<{ message: string }>().message).toContain(
      'contract reviews',
    );
    expect(await counts(tenantId)).toEqual(before);
  });

  it('past the allowance a review costs 10 credits, and trigger-analysis draws on the same allowance', async () => {
    const { tenantId, cookie } = await tenantAdmin('navigator');
    const credits = app.module.get(CreditLedgerService);
    expect((await analyze(cookie)).statusCode).toBe(202);
    await credits.grant({ tenantId, amount: 10, reason: 'test' });

    expect((await analyze(cookie)).statusCode).toBe(202);
    expect(
      await credits.getBalance(tenantId, {
        tenant: { tenantId, schema: 'public' },
      }),
    ).toBe(0);

    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, content, source_type, extraction_status, s3_key, s3_bucket)
       VALUES ($1, 'Upload', 'The employee works 60 hours a week.', 'file_upload', 'completed', $2, 'complytude-files')
       RETURNING id`,
      [tenantId, `tenants/${tenantId}/documents/${randomUUID()}/upload.pdf`],
    );
    const triggered = await server.inject({
      method: 'POST',
      url: `/api/v1/documents/${rows[0].id}/trigger-analysis`,
      headers: { cookie },
      payload: { jurisdiction: 'MAINLAND', documentType: 'employment' },
    });
    expect(triggered.statusCode).toBe(402);
    expect(triggered.json()).toMatchObject({
      feature: 'contract_reviews_per_month',
    });
  });

  it("confirming an upload uses a scan; the free plan's second answers 402 and stays pending", async () => {
    const { tenantId, cookie } = await tenantAdmin('navigator');
    const confirm = (documentId: string) =>
      server.inject({
        method: 'POST',
        url: `/api/v1/documents/${documentId}/confirm-upload`,
        headers: { cookie },
      });

    expect((await confirm(await pendingUpload(tenantId))).statusCode).toBe(202);
    const second = await pendingUpload(tenantId);
    const refused = await confirm(second);

    expect(refused.statusCode).toBe(402);
    expect(refused.json()).toMatchObject({ feature: 'document_scans' });
    const { rows } = await app.databaseService.query<{ status: string }>(
      'SELECT extraction_status AS status FROM public.documents WHERE id = $1',
      [second],
    );
    expect(rows[0].status).toBe('pending');
  });

  it('a review that fails for good is given back', async () => {
    const { tenantId, cookie } = await tenantAdmin('navigator');
    const first = await analyze(cookie);
    expect(first.statusCode).toBe(202);

    await app.module.get(UsageRefundHandler).execute({
      data: {
        tenantId,
        resourceId: first.json<{ analysisJobId: string }>().analysisJobId,
        resourceType: 'analysis_job',
        featureKey: 'contract_reviews_per_month',
        units: 1,
      },
    } as Job<EntitlementUsageRefundJobData>);

    expect((await analyze(cookie)).statusCode).toBe(202);
  });

  it('a burst of concurrent requests never gets past the limit', async () => {
    const tenantId = (await createTestTenant(app.module)).id;
    await createTestSubscription(app.module, tenantId, { planKey: 'shield' });
    await grantAiConsent(app.module, tenantId);
    const enforcement = app.module.get(EntitlementEnforcementService);

    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        enforcement.checkAndRecord({
          tenantId,
          featureKey: 'documents_per_month',
        }),
      ),
    );

    // Shield allows 25 documents a month and the tenant has no credits
    expect(results.filter((r) => r.allowed)).toHaveLength(25);
  });

  it('previews have a daily cap per tenant', async () => {
    const { tenantId, userId, email } = await tenantAdmin('navigator');
    const key = `nda-${randomUUID()}`;
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.templates (key, name, tier, current_version)
       VALUES ($1, 'Mutual NDA', 'essential', '1.0.0') RETURNING id`,
      [key],
    );
    await app.databaseService.query(
      `INSERT INTO public.template_versions (template_id, version, fields)
       VALUES ($1, '1.0.0', $2::jsonb)`,
      [
        rows[0].id,
        JSON.stringify([
          { key: 'party_name', label: 'Party', type: 'text', required: true },
        ]),
      ],
    );
    const preview = () =>
      app.module.get(DocumentPreviewService).preview(
        { templateKey: key, variables: { party_name: 'Acme Trading LLC' } },
        {
          userId,
          email,
          tenantId,
          role: SystemTenantRole.TENANT_ADMIN,
          sessionId: randomUUID(),
        },
      );

    await expect(preview()).resolves.toHaveProperty('generationJobId');
    // The day's count at the cap (default 50)
    await app.redisClient.set(
      `preview-cap:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
      '50',
    );

    await expect(preview()).rejects.toMatchObject({ status: 429 });
  });

  it('a free-plan tenant sees the high-risk findings of a review, and how many more there are', async () => {
    const free = await tenantAdmin('navigator');
    const full = await tenantAdmin('general_counsel');
    const result = {
      summary: 'Two issues.',
      findings: [
        { clauseId: 'C1', riskLevel: 'high', title: 'Hours exceed 48' },
        { clauseId: 'C2', riskLevel: 'medium', title: 'Leave unclear' },
      ],
      clauseVerdicts: [
        { clauseId: 'C1', status: 'violated', reason: '60 hours a week' },
        { clauseId: 'C2', status: 'unclear', reason: 'Leave days not stated' },
      ],
    };
    const jobOf = async (tenantId: string): Promise<string> => {
      const { rows: doc } = await app.databaseService.query<{ id: string }>(
        `INSERT INTO public.documents (tenant_id, title, content, source_type)
         VALUES ($1, 'Contract', 'Text', 'text_input') RETURNING id`,
        [tenantId],
      );
      const { rows: job } = await app.databaseService.query<{ id: string }>(
        `INSERT INTO public.analysis_jobs (tenant_id, document_id, status, result)
         VALUES ($1, $2, 'completed', $3::jsonb) RETURNING id`,
        [tenantId, doc[0].id, JSON.stringify(result)],
      );
      return job[0].id;
    };
    const read = async (tenant: { tenantId: string; cookie: string }) =>
      (
        await server.inject({
          method: 'GET',
          url: `/api/v1/analysis-jobs/${await jobOf(tenant.tenantId)}`,
          headers: { cookie: tenant.cookie },
        })
      ).json<{ result: Record<string, unknown> }>().result;

    expect(await read(free)).toMatchObject({
      riskAnalysisLevel: 'critical_only',
      hiddenFindings: 1,
      findings: [{ clauseId: 'C1', riskLevel: 'high' }],
      clauseVerdicts: [
        { clauseId: 'C1', reason: '60 hours a week' },
        { clauseId: 'C2', status: 'unclear', reason: '' },
      ],
    });
    const everything = await read(full);
    expect(everything.findings).toHaveLength(2);
    expect(everything).not.toHaveProperty('hiddenFindings');
  });
});

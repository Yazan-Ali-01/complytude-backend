import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const PASSWORD = 'Test123!@#';

type Headers = Record<string, string | string[] | undefined>;

/**
 * The document and job endpoints over HTTP, signed in as real users: a tenant reaches its own
 * documents and jobs; another tenant gets 404 for every one of them (never 403, which would
 * confirm the id exists); a role without the permission gets 403.
 */
describe('Document endpoints: ownership and permissions over HTTP', () => {
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

  function call(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    cookie: string,
    payload?: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> {
    return server.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie },
      ...(payload ? { payload } : {}),
    });
  }

  /** Identity and tenant cookies for a user switched into the tenant, as a browser holds them. */
  async function signInTo(email: string, tenantId: string): Promise<string> {
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const identity = cookieHeaderFromSetCookie(login.headers as Headers);
    const switched = await call('POST', '/auth/tenant-switch', identity, {
      tenantId,
    });
    expect(switched.statusCode).toBe(200);
    return `${identity}; ${cookieHeaderFromSetCookie(switched.headers as Headers)}`;
  }

  async function member(
    tenantId: string,
    role: SystemTenantRole,
  ): Promise<string> {
    const { user } = await createTestUserInTenant(app.module, tenantId, {
      role,
    });
    return signInTo(user.email, tenantId);
  }

  /** A tenant with an extracted document, an analysis job and a generation job. */
  async function tenantWithWork(
    planKey: 'navigator' | 'shield' = 'navigator',
  ): Promise<{
    tenantId: string;
    admin: string;
    documentId: string;
    analysisJobId: string;
    generationJobId: string;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const db = app.databaseService;
    const {
      rows: [document],
    } = await db.query<{ id: string }>(
      `INSERT INTO public.documents
         (tenant_id, title, source_type, s3_key, s3_bucket, mime_type, content,
          extraction_status, created_by)
       VALUES ($1, 'Secret contract.pdf', 'file_upload', $2, 'test-files', 'application/pdf',
               'Confidential terms', 'completed', $3)
       RETURNING id`,
      [
        tenant.id,
        `tenants/${tenant.id}/documents/${randomUUID()}/c.pdf`,
        user.id,
      ],
    );
    const {
      rows: [analysis],
    } = await db.query<{ id: string }>(
      `INSERT INTO public.analysis_jobs (tenant_id, document_id, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [tenant.id, document.id, user.id],
    );
    const {
      rows: [template],
    } = await db.query<{ id: string }>(
      `INSERT INTO public.templates (key, name, tier, current_version)
       VALUES ($1, 'NDA', 'essential', '1.0.0') RETURNING id`,
      [`nda-${randomUUID()}`],
    );
    const {
      rows: [version],
    } = await db.query<{ id: string }>(
      `INSERT INTO public.template_versions (template_id, version, fields)
       VALUES ($1, '1.0.0', '[]'::jsonb) RETURNING id`,
      [template.id],
    );
    const {
      rows: [generation],
    } = await db.query<{ id: string }>(
      `INSERT INTO public.generation_jobs
         (tenant_id, template_id, template_version_id, job_type, variables, created_by)
       VALUES ($1, $2, $3, 'generate', '{}'::jsonb, $4) RETURNING id`,
      [tenant.id, template.id, version.id, user.id],
    );
    return {
      tenantId: tenant.id,
      admin: await signInTo(user.email, tenant.id),
      documentId: document.id,
      analysisJobId: analysis.id,
      generationJobId: generation.id,
    };
  }

  const reads = (w: {
    documentId: string;
    analysisJobId: string;
    generationJobId: string;
  }): string[] => [
    `/documents/${w.documentId}`,
    `/documents/${w.documentId}/download-url`,
    `/documents/${w.documentId}/analysis`,
    `/analysis-jobs/${w.analysisJobId}`,
    `/generation-jobs/${w.generationJobId}`,
  ];

  it('a tenant reads its own document, download URL and jobs', async () => {
    const own = await tenantWithWork();

    for (const url of reads(own)) {
      const response = await call('GET', url, own.admin);
      expect({ url, status: response.statusCode }).toEqual({
        url,
        status: 200,
      });
    }
    const document = await call(
      'GET',
      `/documents/${own.documentId}`,
      own.admin,
    );
    expect(document.body).toContain('Secret contract.pdf');
  });

  it("another tenant gets 404 for every one of them, and can't delete the document", async () => {
    const victim = await tenantWithWork();
    const attacker = await tenantWithWork();

    for (const url of reads(victim)) {
      const response = await call('GET', url, attacker.admin);
      expect({ url, status: response.statusCode }).toEqual({
        url,
        status: 404,
      });
      expect(response.body).not.toContain('Secret contract');
    }
    expect(
      (await call('DELETE', `/documents/${victim.documentId}`, attacker.admin))
        .statusCode,
    ).toBe(404);
    // Still there for its owner
    expect(
      (await call('GET', `/documents/${victim.documentId}`, victim.admin))
        .statusCode,
    ).toBe(200);
  });

  it("the document list shows only the caller's tenant", async () => {
    const one = await tenantWithWork();
    const other = await tenantWithWork();

    const list = await call('GET', '/documents', one.admin);

    expect(list.statusCode).toBe(200);
    expect(list.body).toContain(one.documentId);
    expect(list.body).not.toContain(other.documentId);
  });

  it('upload-url creates a pending document under the caller tenant; viewers and plans without scans may not upload', async () => {
    const own = await tenantWithWork('shield');

    const response = await call('POST', '/documents/upload-url', own.admin, {
      filename: 'lease.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 2048,
    });

    expect(response.statusCode).toBe(201);
    const { documentId } = response.json<{ documentId: string }>();
    const { rows } = await app.databaseService.query<{
      tenant_id: string;
      extraction_status: string;
      s3_key: string;
    }>(
      'SELECT tenant_id, extraction_status, s3_key FROM public.documents WHERE id = $1',
      [documentId],
    );
    expect(rows[0]).toMatchObject({
      tenant_id: own.tenantId,
      extraction_status: 'pending',
    });
    expect(rows[0].s3_key.startsWith(`tenants/${own.tenantId}/`)).toBe(true);

    const viewer = await member(own.tenantId, SystemTenantRole.VIEWER);
    expect(
      (
        await call('POST', '/documents/upload-url', viewer, {
          filename: 'x.pdf',
          contentType: 'application/pdf',
          fileSizeBytes: 10,
        })
      ).statusCode,
    ).toBe(403);

    // Navigator includes no document scans
    const free = await tenantWithWork('navigator');
    expect(
      (
        await call('POST', '/documents/upload-url', free.admin, {
          filename: 'x.pdf',
          contentType: 'application/pdf',
          fileSizeBytes: 10,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('only a role with documents:delete may delete; the deleted document disappears', async () => {
    const own = await tenantWithWork();
    const memberCookie = await member(own.tenantId, SystemTenantRole.MEMBER);

    expect(
      (await call('DELETE', `/documents/${own.documentId}`, memberCookie))
        .statusCode,
    ).toBe(403);

    const deleted = await call(
      'DELETE',
      `/documents/${own.documentId}`,
      own.admin,
    );
    expect(deleted.statusCode).toBeLessThan(300);
    expect(
      (await call('GET', `/documents/${own.documentId}`, own.admin)).statusCode,
    ).toBe(404);
    // Soft delete: the row is kept for the audit trail
    const { rows } = await app.databaseService.query<{
      deleted_at: Date | null;
    }>('SELECT deleted_at FROM public.documents WHERE id = $1', [
      own.documentId,
    ]);
    expect(rows[0].deleted_at).not.toBeNull();
  });
});

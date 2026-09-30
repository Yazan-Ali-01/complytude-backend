import { AuditService } from '@lib/audit';
import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { AI_DISCLOSURE_VERSION } from 'src/common/constants/ai-disclosure.constant';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import {
  createTestSubscription,
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
  grantAiConsent,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

type Headers = Record<string, string | string[] | undefined>;
const DIMENSIONS = 1536;

/**
 * An organization agrees to AI processing once (D-5): a checkbox when it is set up, or a tenant
 * admin later. Until it has agreed to the current disclosure version, analysis and uploads are
 * refused with nothing created and no job queued (DOC-004, AI-P8).
 */
describe('AI processing consent', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: AuditService, useClass: AuditService }],
    });
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await app.databaseService.query('DELETE FROM public.audit_logs');
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

  async function applicableRuleset(): Promise<void> {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    vector[0] = 1;
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.rulesets (key, name, jurisdictions, document_types)
       VALUES ($1, 'Labour', ARRAY['MAINLAND'], ARRAY['employment']) RETURNING id`,
      [`labour_${randomUUID().slice(0, 8)}`],
    );
    const { rows: version } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.ruleset_versions (ruleset_id, version) VALUES ($1, '1.0.0') RETURNING id`,
      [rows[0].id],
    );
    await app.databaseService.query(
      `INSERT INTO public.ruleset_chunks (ruleset_id, ruleset_version_id, chunk_index, content, embedding)
       VALUES ($1, $2, 0, 'Working hours are at most 48 a week.', $3::vector)`,
      [rows[0].id, version[0].id, `[${vector.join(',')}]`],
    );
  }

  async function signIn(email: string): Promise<string> {
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Test123!@#' },
    });
    expect(login.statusCode).toBe(200);
    return cookieHeaderFromSetCookie(login.headers as Headers);
  }

  async function switchTo(identity: string, tenantId: string): Promise<string> {
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: identity },
      payload: { tenantId },
    });
    expect(switched.statusCode).toBe(200);
    return `${identity}; ${cookieHeaderFromSetCookie(switched.headers as Headers)}`;
  }

  /** A Shield organization and a signed-in user of it with `role`. */
  async function member(
    role: SystemTenantRole,
    tenantId?: string,
  ): Promise<{ tenantId: string; userId: string; cookie: string }> {
    let id = tenantId;
    if (!id) {
      id = (await createTestTenant(app.module)).id;
      await createTestSubscription(app.module, id, { planKey: 'shield' });
    }
    const { user } = await createTestUserInTenant(app.module, id, { role });
    return {
      tenantId: id,
      userId: user.id,
      cookie: await switchTo(await signIn(user.email), id),
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

  function consent(cookie: string, version?: string) {
    return server.inject({
      method: version === undefined ? 'GET' : 'POST',
      url: '/api/v1/tenants/me/ai-consent',
      headers: { cookie },
      ...(version === undefined ? {} : { payload: { version } }),
    });
  }

  async function insertDocument(
    tenantId: string,
    status: 'pending' | 'completed',
  ): Promise<string> {
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.documents
         (tenant_id, title, source_type, content, s3_key, s3_bucket, original_filename, mime_type,
          file_size_bytes, extraction_status)
       VALUES ($1, 'lease.pdf', 'file_upload', $2, $3, 'mock-quarantine-bucket', 'lease.pdf',
               'application/pdf', 2048576, $4)
       RETURNING id`,
      [
        tenantId,
        status === 'completed' ? 'The employee works 60 hours a week.' : null,
        `tenants/${tenantId}/documents/${randomUUID()}/lease.pdf`,
        status,
      ],
    );
    return rows[0].id;
  }

  async function state(tenantId: string): Promise<{
    documents: number;
    jobs: number;
    usage: number;
    pending: number;
  }> {
    const { rows } = await app.databaseService.query<{
      documents: number;
      jobs: number;
      usage: number;
      pending: number;
    }>(
      `SELECT (SELECT count(*)::int FROM public.documents WHERE tenant_id = $1) AS documents,
              (SELECT count(*)::int FROM public.analysis_jobs WHERE tenant_id = $1) AS jobs,
              (SELECT count(*)::int FROM public.usage_ledger WHERE tenant_id = $1) AS usage,
              (SELECT count(*)::int FROM public.documents
                WHERE tenant_id = $1 AND extraction_status = 'pending') AS pending`,
      [tenantId],
    );
    return rows[0];
  }

  async function queued(name: string): Promise<number> {
    const counts = await app.module
      .get<Queue>(getQueueToken(name))
      .getJobCounts('waiting', 'delayed', 'active', 'prioritized');
    return Object.values(counts).reduce((sum, n) => sum + n, 0);
  }

  async function audited(
    tenantId: string,
  ): Promise<Array<{ actor_id: string; details: Record<string, unknown> }>> {
    for (let i = 0; i < 40; i++) {
      const { rows } = await app.databaseService.query<{
        actor_id: string;
        details: Record<string, unknown>;
      }>(
        `SELECT actor_id, details FROM public.audit_logs
         WHERE action = 'AI_PROCESSING_ACCEPTED' AND tenant_id = $1`,
        [tenantId],
      );
      if (rows.length > 0) return rows;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return [];
  }

  it('refuses analysis, trigger-analysis and uploads until the organization agrees, creating nothing', async () => {
    const admin = await member(SystemTenantRole.TENANT_ADMIN);
    const upload = await insertDocument(admin.tenantId, 'pending');
    const extracted = await insertDocument(admin.tenantId, 'completed');
    const before = await state(admin.tenantId);

    const responses = [
      await analyze(admin.cookie),
      await server.inject({
        method: 'POST',
        url: `/api/v1/documents/${extracted}/trigger-analysis`,
        headers: { cookie: admin.cookie },
        payload: { jurisdiction: 'MAINLAND', documentType: 'employment' },
      }),
      await server.inject({
        method: 'POST',
        url: `/api/v1/documents/${upload}/confirm-upload`,
        headers: { cookie: admin.cookie },
      }),
    ];

    for (const response of responses) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        reason: 'ai_consent_required',
        disclosureVersion: AI_DISCLOSURE_VERSION,
        message: expect.stringContaining('AI processing') as string,
      });
    }
    expect(await state(admin.tenantId)).toEqual(before);
    expect(before).toMatchObject({ jobs: 0, usage: 0, pending: 1 });
    expect(await queued(QUEUE_NAMES.AI_PROCESSING)).toBe(0);
    expect(await queued(QUEUE_NAMES.DATA_INGESTION)).toBe(0);
    // In the request's language
    const arabic = await server.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: { cookie: admin.cookie, 'accept-language': 'ar' },
      payload: {
        title: 'Employment contract',
        content: 'The employee works 60 hours a week.',
        jurisdiction: 'MAINLAND',
        documentType: 'employment',
      },
    });
    expect(arabic.json<{ message: string }>().message).toMatch(/الذكاء/);
  });

  it('records the setup checkbox with the organization, and analysis then works', async () => {
    const user = await createTestUser(app.module);
    const identity = await signIn(user.email);

    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      headers: { cookie: identity },
      payload: {
        name: `Consenting ${randomUUID().slice(0, 8)}`,
        aiDisclosureVersion: AI_DISCLOSURE_VERSION,
      },
    });
    expect(created.statusCode).toBe(201);
    const tenantId = created.json<{ id: string }>().id;
    const cookie = await switchTo(identity, tenantId);

    const status = await consent(cookie);
    expect(status.json()).toMatchObject({
      currentVersion: AI_DISCLOSURE_VERSION,
      accepted: true,
      acceptedVersion: AI_DISCLOSURE_VERSION,
      acceptedBy: user.id,
    });
    expect(await audited(tenantId)).toEqual([
      {
        actor_id: user.id,
        details: expect.objectContaining({
          disclosureVersion: AI_DISCLOSURE_VERSION,
          channel: 'organization_setup',
        }) as Record<string, unknown>,
      },
    ]);
    expect((await analyze(cookie)).statusCode).toBe(202);
  });

  it('refuses a setup checkbox for an outdated disclosure, and creates no organization', async () => {
    const user = await createTestUser(app.module);
    const name = `Outdated ${randomUUID().slice(0, 8)}`;

    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      headers: { cookie: await signIn(user.email) },
      payload: { name, aiDisclosureVersion: '2020-01-01' },
    });

    expect(created.statusCode).toBe(400);
    const { rows } = await app.databaseService.query(
      'SELECT 1 FROM public.tenants WHERE name = $1',
      [name],
    );
    expect(rows).toHaveLength(0);
  });

  it('lets a tenant admin accept later, but not a member; accepting twice changes nothing', async () => {
    const admin = await member(SystemTenantRole.TENANT_ADMIN);
    const plain = await member(SystemTenantRole.MEMBER, admin.tenantId);

    expect((await consent(plain.cookie)).json()).toMatchObject({
      accepted: false,
      acceptedVersion: null,
    });
    expect(
      (await consent(plain.cookie, AI_DISCLOSURE_VERSION)).statusCode,
    ).toBe(403);
    expect((await consent(admin.cookie, '2020-01-01')).statusCode).toBe(400);

    const accepted = await consent(admin.cookie, AI_DISCLOSURE_VERSION);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      accepted: true,
      acceptedBy: admin.userId,
    });
    expect(
      (await consent(admin.cookie, AI_DISCLOSURE_VERSION)).statusCode,
    ).toBe(200);

    const { rows } = await app.databaseService.query(
      'SELECT 1 FROM public.tenant_ai_consents WHERE tenant_id = $1',
      [admin.tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(await audited(admin.tenantId)).toEqual([
      {
        actor_id: admin.userId,
        details: expect.objectContaining({ channel: 'settings' }) as Record<
          string,
          unknown
        >,
      },
    ]);
    // Anyone in the organization can analyze now
    expect((await analyze(plain.cookie)).statusCode).toBe(202);
  });

  it('asks again when the disclosure changes: an older version is not consent', async () => {
    const admin = await member(SystemTenantRole.TENANT_ADMIN);
    await grantAiConsent(app.module, admin.tenantId, '2025-01-01');

    const response = await analyze(admin.cookie);

    expect(response.statusCode).toBe(403);
    expect((await consent(admin.cookie)).json()).toMatchObject({
      accepted: false,
      acceptedVersion: '2025-01-01',
    });
  });

  it("keeps each organization's consent to itself", async () => {
    const consenting = await member(SystemTenantRole.TENANT_ADMIN);
    await grantAiConsent(app.module, consenting.tenantId);
    const other = await member(SystemTenantRole.TENANT_ADMIN);

    expect((await analyze(consenting.cookie)).statusCode).toBe(202);
    expect((await analyze(other.cookie)).statusCode).toBe(403);
  });
});

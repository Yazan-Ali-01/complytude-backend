import { NotFoundException } from '@nestjs/common';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DocumentsService } from 'src/modules/documents/documents.service';
import { StorageService } from 'src/modules/storage/storage.service';
import { DataRetentionSweepHandler } from 'src/modules/tenant-processing/handlers/data-retention-sweep.handler';
import type { AuthenticatedTenantUser } from 'src/modules/auth/strategies';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { DocumentReadRepository } from '../../../worker-ai/src/repositories/document-read.repository';
import { DocumentWriteRepository } from '../../../worker-ingestion/src/repositories/document-write.repository';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Deleting a document moves it to a 30-day trash: hidden everywhere, workers included, but kept and
 * restorable. The daily retention sweep then erases what it says (text, structure, contract
 * variables, job results and variables) and its file; it also removes expired tokens and
 * invitations and abandoned uploads, and nothing else.
 */
describe('Document deletion and data retention', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  const db = (): TestApp['databaseService'] => app.databaseService;
  const DAY_MS = 24 * 60 * 60 * 1000;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** What a document and its jobs say, without ids or timestamps. */
  async function contentOf(documentId: string): Promise<{
    erased_at: Date | null;
    content: string | null;
    content_structured: unknown;
    generation_variables: unknown;
    result: unknown;
    variables: unknown;
  }> {
    const { rows } = await db().query<{
      erased_at: Date | null;
      content: string | null;
      content_structured: unknown;
      generation_variables: unknown;
      result: unknown;
      variables: unknown;
    }>(
      `SELECT d.erased_at, d.content, d.content_structured, d.generation_variables,
              a.result, g.variables
       FROM public.documents d
       JOIN public.analysis_jobs a ON a.document_id = d.id
       JOIN public.generation_jobs g ON g.document_id = d.id
       WHERE d.id = $1`,
      [documentId],
    );
    return rows[0];
  }

  async function deletedDaysAgo(
    documentId: string,
    days: number,
  ): Promise<void> {
    await db().query(
      `UPDATE public.documents SET deleted_at = now() - make_interval(days => $2) WHERE id = $1`,
      [documentId, days],
    );
  }

  async function tenantAdmin(): Promise<{
    tenantId: string;
    user: AuthenticatedTenantUser;
  }> {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    return {
      tenantId: tenant.id,
      user: {
        userId: user.id,
        email: user.email,
        tenantId: tenant.id,
        role: SystemTenantRole.TENANT_ADMIN,
        sessionId: randomUUID(),
      } as AuthenticatedTenantUser,
    };
  }

  /** A generated contract with its generation job, and an analysis of it. */
  async function contract(tenantId: string, userId: string) {
    const {
      rows: [template],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.templates (key, name, tier, current_version)
       VALUES ($1, 'NDA', 'essential', '1.0.0') RETURNING id`,
      [`nda-${randomUUID()}`],
    );
    const {
      rows: [version],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.template_versions (template_id, version, fields)
       VALUES ($1, '1.0.0', '[]'::jsonb) RETURNING id`,
      [template.id],
    );
    const {
      rows: [document],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.documents
         (tenant_id, title, source_type, s3_key, s3_bucket, content, content_structured,
          template_id, template_version_id, generation_variables, created_by, extraction_status)
       VALUES ($1, 'NDA with Acme', 'generated', 'k', 'b', 'Salary AED 40,000',
               '[{"heading":"Pay","content":"Salary AED 40,000"}]'::jsonb, $2, $3,
               '{"party_name":"Acme","salary":"40000"}'::jsonb, $4, 'completed')
       RETURNING id`,
      [tenantId, template.id, version.id, userId],
    );
    const {
      rows: [generation],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.generation_jobs
         (tenant_id, template_id, template_version_id, job_type, status, variables, created_by, document_id)
       VALUES ($1, $2, $3, 'generate', 'completed', '{"salary":"40000"}'::jsonb, $4, $5)
       RETURNING id`,
      [tenantId, template.id, version.id, userId, document.id],
    );
    const {
      rows: [analysis],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.analysis_jobs (tenant_id, document_id, status, result)
       VALUES ($1, $2, 'completed', '{"summary":"Salary AED 40,000 is compliant"}'::jsonb)
       RETURNING id`,
      [tenantId, document.id],
    );
    return {
      documentId: document.id,
      generationJobId: generation.id,
      analysisJobId: analysis.id,
    };
  }

  it('deleting moves a document to the trash: hidden everywhere, kept, and restorable', async () => {
    const { tenantId, user } = await tenantAdmin();
    const own = await contract(tenantId, user.userId);
    const documents = app.module.get(DocumentsService);
    const count = (): Promise<number> =>
      app.module.get(TenantRepository).getDocumentCount(tenantId, {
        tenant: { tenantId, schema: 'public' },
      });
    expect(await count()).toBe(1);

    const deleted = await documents.remove(own.documentId, user);

    expect(
      Date.parse(deleted.restorableUntil) - Date.parse(deleted.deletedAt),
    ).toBe(30 * DAY_MS);
    // Nothing is erased yet: a restore brings everything back
    const kept = await contentOf(own.documentId);
    expect(kept.erased_at).toBeNull();
    expect(JSON.stringify(kept)).toContain('40,000');

    // The API, the count and both workers no longer see it
    await expect(
      documents.findOne(own.documentId, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      documents.getAnalysisJobById(own.analysisJobId, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await count()).toBe(0);
    expect(
      await new DocumentReadRepository(app.appDatabaseService).findContentById(
        tenantId,
        own.documentId,
      ),
    ).toBeNull();
    expect(
      await new DocumentWriteRepository(app.appDatabaseService).findById(
        tenantId,
        own.documentId,
      ),
    ).toBeNull();

    // The trash lists it; another organization neither sees nor restores it
    const trash = await documents.listTrash({}, user);
    expect(trash.data.map((d) => d.id)).toEqual([own.documentId]);
    expect(trash.data[0]).toMatchObject({
      title: 'NDA with Acme',
      deletedBy: user.userId,
      restorableUntil: deleted.restorableUntil,
    });
    const other = await tenantAdmin();
    expect((await documents.listTrash({}, other.user)).data).toEqual([]);
    await expect(
      documents.restore(own.documentId, other.user),
    ).rejects.toBeInstanceOf(NotFoundException);

    const restored = await documents.restore(own.documentId, user);

    expect(restored.id).toBe(own.documentId);
    expect((await documents.findOne(own.documentId, user)).content).toBe(
      'Salary AED 40,000',
    );
    expect(
      await new DocumentReadRepository(app.appDatabaseService).findContentById(
        tenantId,
        own.documentId,
      ),
    ).not.toBeNull();
    expect(await count()).toBe(1);
    expect((await documents.listTrash({}, user)).data).toEqual([]);
    await expect(
      documents.restore(own.documentId, user),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('after 30 days in the trash the sweep erases it and its file, and it can no longer be restored', async () => {
    const { tenantId, user } = await tenantAdmin();
    const documents = app.module.get(DocumentsService);
    const expired = await contract(tenantId, user.userId);
    const recent = await contract(tenantId, user.userId);
    await documents.remove(expired.documentId, user);
    await documents.remove(recent.documentId, user);
    await deletedDaysAgo(expired.documentId, 31);
    await deletedDaysAgo(recent.documentId, 29);
    const deleteFile = jest.spyOn(
      app.module.get(StorageService),
      'deleteObjectFromBucket',
    );

    await app.module.get(DataRetentionSweepHandler).execute();

    const erased = await contentOf(expired.documentId);
    expect(erased).toMatchObject({
      content: null,
      content_structured: null,
      generation_variables: {},
      result: null,
      variables: {},
    });
    expect(erased.erased_at).not.toBeNull();
    const { erased_at: _erasedAt, ...said } = erased;
    expect(JSON.stringify(said)).not.toContain('40');
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith('b', 'k');
    await expect(
      documents.restore(expired.documentId, user),
    ).rejects.toBeInstanceOf(NotFoundException);

    // 29 days in: untouched, still listed and restorable
    expect((await contentOf(recent.documentId)).erased_at).toBeNull();
    expect((await documents.listTrash({}, user)).data.map((d) => d.id)).toEqual(
      [recent.documentId],
    );
    await documents.restore(recent.documentId, user);
    expect((await documents.findOne(recent.documentId, user)).content).toBe(
      'Salary AED 40,000',
    );
  });

  it('over HTTP: delete, list the trash, restore (needs documents:delete)', async () => {
    const server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    const signIn = async (role: SystemTenantRole): Promise<string> => {
      const { user } = await createTestUserInTenant(app.module, tenant.id, {
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
        payload: { tenantId: tenant.id },
      });
      expect(switched.statusCode).toBe(200);
      return cookieHeaderFromSetCookie(
        switched.headers as Record<string, string | string[] | undefined>,
      );
    };
    const admin = await signIn(SystemTenantRole.TENANT_ADMIN);
    const viewer = await signIn(SystemTenantRole.VIEWER);
    const {
      rows: [document],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, source_type, content, created_by)
       VALUES ($1, 'Pasted clause', 'text_input', 'Clause text', (SELECT user_id FROM public.user_tenants WHERE tenant_id = $1 LIMIT 1))
       RETURNING id`,
      [tenant.id],
    );
    const call = (
      cookie: string,
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
    ): Promise<LightMyRequestResponse> =>
      server.inject({
        method,
        url: `/api/v1/documents${url}`,
        headers: { cookie },
      });

    const deleted = await call(admin, 'DELETE', `/${document.id}`);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json<{ message: string }>().message).toContain('30');

    const trash = await call(viewer, 'GET', '/trash');
    expect(trash.statusCode).toBe(200);
    expect(trash.json<{ data: { id: string }[] }>().data).toEqual([
      expect.objectContaining({ id: document.id }),
    ]);
    expect((await call(admin, 'GET', `/${document.id}`)).statusCode).toBe(404);

    expect(
      (await call(viewer, 'POST', `/${document.id}/restore`)).statusCode,
    ).toBe(403);
    const restored = await call(admin, 'POST', `/${document.id}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(restored.json<{ id: string }>().id).toBe(document.id);
    expect((await call(admin, 'GET', `/${document.id}`)).statusCode).toBe(200);
    expect(
      (await call(admin, 'POST', `/${document.id}/restore`)).statusCode,
    ).toBe(404);
  });

  it('a text-input document keeps a valid (empty) body once erased', async () => {
    const { tenantId, user } = await tenantAdmin();
    const {
      rows: [document],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, source_type, content, created_by)
       VALUES ($1, 'Pasted clause', 'text_input', 'Confidential clause text', $2) RETURNING id`,
      [tenantId, user.userId],
    );

    await app.module.get(DocumentsService).remove(document.id, user);
    await deletedDaysAgo(document.id, 31);
    await app.module.get(DataRetentionSweepHandler).execute();

    const { rows } = await db().query<{
      content: string;
      erased_at: Date | null;
    }>('SELECT content, erased_at FROM public.documents WHERE id = $1', [
      document.id,
    ]);
    expect(rows[0].content).toBe('');
    expect(rows[0].erased_at).not.toBeNull();
  });

  describe('daily retention sweep', () => {
    it('removes expired tokens and invitations and abandoned uploads, and leaves the rest', async () => {
      const { tenantId, user } = await tenantAdmin();
      const token = (): string => randomUUID();
      await db().query(
        `INSERT INTO public.email_verifications (user_id, token, expires_at) VALUES
           ($1, $2, now() - interval '8 days'), ($1, $3, now() + interval '1 day')`,
        [user.userId, token(), token()],
      );
      await db().query(
        `INSERT INTO public.password_resets (user_id, token, expires_at) VALUES
           ($1, $2, now() - interval '8 days'), ($1, $3, now() - interval '1 day')`,
        [user.userId, token(), token()],
      );
      const {
        rows: [role],
      } = await db().query<{ id: string }>(
        `SELECT id FROM public.tenant_roles WHERE key = 'member' AND tenant_id IS NULL`,
      );
      const {
        rows: [expiredInvite, liveInvite],
      } = await db().query<{ id: string }>(
        `INSERT INTO public.invitations (email, tenant_id, token_hash, invited_by, expires_at, role_id)
         VALUES ('late@test.com', $1, $2, $3, now() - interval '1 hour', $5),
                ('soon@test.com', $1, $4, $3, now() + interval '1 day', $5)
         RETURNING id`,
        [tenantId, token(), user.userId, token(), role.id],
      );
      const upload = async (age: string): Promise<string> =>
        (
          await db().query<{ id: string }>(
            `INSERT INTO public.documents
               (tenant_id, title, source_type, s3_key, extraction_status, created_at, created_by)
             VALUES ($1, 'upload.pdf', 'file_upload', 'k', 'pending', now() - $2::interval, $3)
             RETURNING id`,
            [tenantId, age, user.userId],
          )
        ).rows[0].id;
      const abandoned = await upload('3 days');
      const recent = await upload('1 hour');

      await app.module.get(DataRetentionSweepHandler).execute();

      const count = async (sql: string): Promise<number> =>
        Number((await db().query<{ n: string }>(sql, [user.userId])).rows[0].n);
      expect(
        await count(
          'SELECT COUNT(*) AS n FROM public.email_verifications WHERE user_id = $1',
        ),
      ).toBe(1);
      expect(
        await count(
          'SELECT COUNT(*) AS n FROM public.password_resets WHERE user_id = $1',
        ),
      ).toBe(1);
      const status = async (id: string): Promise<string> =>
        (
          await db().query<{ status: string }>(
            'SELECT status FROM public.invitations WHERE id = $1',
            [id],
          )
        ).rows[0].status;
      expect(await status(expiredInvite.id)).toBe('EXPIRED');
      expect(await status(liveInvite.id)).toBe('PENDING');
      const state = async (
        id: string,
      ): Promise<{ deleted_at: Date | null; erased_at: Date | null }> =>
        (
          await db().query<{
            deleted_at: Date | null;
            erased_at: Date | null;
          }>(
            'SELECT deleted_at, erased_at FROM public.documents WHERE id = $1',
            [id],
          )
        ).rows[0];
      // An abandoned upload has nothing to restore: erased at once, never in the trash
      const removed = await state(abandoned);
      expect(removed.deleted_at).not.toBeNull();
      expect(removed.erased_at).not.toBeNull();
      expect(await state(recent)).toEqual({
        deleted_at: null,
        erased_at: null,
      });
      expect(
        (await app.module.get(DocumentsService).listTrash({}, user)).data,
      ).toEqual([]);
    });
  });
});

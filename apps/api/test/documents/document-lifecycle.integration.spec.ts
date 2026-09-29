import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DocumentsService } from 'src/modules/documents/documents.service';
import { DataRetentionSweepHandler } from 'src/modules/tenant-processing/handlers/data-retention-sweep.handler';
import type { AuthenticatedTenantUser } from 'src/modules/auth/strategies';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { DocumentReadRepository } from '../../../worker-ai/src/repositories/document-read.repository';
import { DocumentWriteRepository } from '../../../worker-ingestion/src/repositories/document-write.repository';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Deleting a document erases what it says (text, structure, contract variables, job results and
 * variables) and hides it everywhere, workers included; the daily retention sweep removes expired
 * tokens and invitations and abandoned uploads, and nothing else.
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

  it('deleting a document erases its text, variables and job results, and hides it', async () => {
    const { tenantId, user } = await tenantAdmin();
    const own = await contract(tenantId, user.userId);
    const documents = app.module.get(DocumentsService);
    expect(
      await app.module.get(TenantRepository).getDocumentCount(tenantId, {
        tenant: { tenantId, schema: 'public' },
      }),
    ).toBe(1);

    await documents.remove(own.documentId, user);

    const { rows } = await db().query<Record<string, unknown>>(
      `SELECT d.deleted_at, d.deleted_by, d.content, d.content_structured, d.generation_variables,
              a.result, g.variables
       FROM public.documents d
       JOIN public.analysis_jobs a ON a.document_id = d.id
       JOIN public.generation_jobs g ON g.document_id = d.id
       WHERE d.id = $1`,
      [own.documentId],
    );
    expect(rows[0]).toMatchObject({
      deleted_by: user.userId,
      content: null,
      content_structured: null,
      generation_variables: {},
      result: null,
      variables: {},
    });
    expect(rows[0].deleted_at).not.toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain('40');

    // The API, the count and both workers no longer see it
    await expect(
      documents.getAnalysisJobById(own.analysisJobId, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await app.module.get(TenantRepository).getDocumentCount(tenantId, {
        tenant: { tenantId, schema: 'public' },
      }),
    ).toBe(0);
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
  });

  it('a text-input document keeps a valid (empty) body once deleted', async () => {
    const { tenantId, user } = await tenantAdmin();
    const {
      rows: [document],
    } = await db().query<{ id: string }>(
      `INSERT INTO public.documents (tenant_id, title, source_type, content, created_by)
       VALUES ($1, 'Pasted clause', 'text_input', 'Confidential clause text', $2) RETURNING id`,
      [tenantId, user.userId],
    );

    await app.module.get(DocumentsService).remove(document.id, user);

    const { rows } = await db().query<{ content: string }>(
      'SELECT content FROM public.documents WHERE id = $1',
      [document.id],
    );
    expect(rows[0].content).toBe('');
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
      const deletedAt = async (id: string): Promise<Date | null> =>
        (
          await db().query<{ deleted_at: Date | null }>(
            'SELECT deleted_at FROM public.documents WHERE id = $1',
            [id],
          )
        ).rows[0].deleted_at;
      expect(await deletedAt(abandoned)).not.toBeNull();
      expect(await deletedAt(recent)).toBeNull();
    });
  });
});

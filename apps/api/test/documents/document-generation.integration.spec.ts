import { DocxRendererService } from '@lib/docx-renderer';
import type { PdfConversionService } from '@lib/pdf';
import {
  getQueueToken,
  QUEUE_NAMES,
  QueueProducerService,
  type DocumentGenerationJobData,
  type Queue,
} from '@lib/queue';
import type { S3Service } from '@lib/storage';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import PizZip from 'pizzip';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DocumentPreviewService } from 'src/modules/documents/services/document-preview.service';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { DocumentWriteRepository } from '../../../worker-generation/src/repositories/document-write.repository';
import { GenerationJobWriteRepository } from '../../../worker-generation/src/repositories/generation-job-write.repository';
import { DocumentGenerationWorkerService } from '../../../worker-generation/src/services/document-generation.service';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const TEMPLATES_BUCKET = 'test-templates';
const FILES_BUCKET = 'test-files';

/** A one-paragraph DOCX with a {{party_name}} placeholder. */
function templateDocx(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Agreement with {{party_name}}</w:t></w:r></w:p></w:body></w:document>',
  );
  return zip.generate({ type: 'nodebuffer' });
}

/** S3 as the worker sees it: objects by bucket and key. */
class FakeS3 {
  readonly objects = new Map<string, Buffer>();

  putObject(bucket: string, key: string, body: Buffer): Promise<void> {
    this.objects.set(`${bucket}/${key}`, body);
    return Promise.resolve();
  }

  getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    const body = this.objects.get(`${bucket}/${key}`);
    return body
      ? Promise.resolve(body)
      : Promise.reject(new Error('NoSuchKey'));
  }

  keys(prefix: string): string[] {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix));
  }
}

/**
 * Generation end to end on the migrated schema: the API creates the job and records the usage,
 * the worker (as the app role) renders the DOCX, stores the PDF and creates the document.
 * Gotenberg and S3 are faked; the DOCX renderer is real.
 */
describe('Document generation end to end (app role)', () => {
  let app: TestApp;
  let s3: FakeS3;
  let convertDocxToPdf: jest.Mock;
  let worker: DocumentGenerationWorkerService;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    s3 = new FakeS3();
    convertDocxToPdf = jest
      .fn()
      .mockImplementation((docx: Buffer) =>
        Promise.resolve(Buffer.concat([Buffer.from('%PDF-'), docx])),
      );
    const config = {
      get: (key: string) =>
        key === 'storage.buckets.templatesBucketName'
          ? TEMPLATES_BUCKET
          : FILES_BUCKET,
    } as unknown as ConfigService;
    worker = new DocumentGenerationWorkerService(
      new DocxRendererService(),
      { convertDocxToPdf } as unknown as PdfConversionService,
      s3 as unknown as S3Service,
      new GenerationJobWriteRepository(app.appDatabaseService),
      new DocumentWriteRepository(),
      config,
      app.module.get(QueueProducerService),
      app.appDatabaseService,
    );
  }, 15000);

  // Usage writes and refunds queue entitlement jobs; let them finish
  afterEach(async () => {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
  }, 35000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** A Navigator tenant asks the API to generate from an essential template. */
  async function requestGeneration(): Promise<{
    tenantId: string;
    data: DocumentGenerationJobData;
  }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'navigator',
    });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
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
    await s3.putObject(
      TEMPLATES_BUCKET,
      `templates/${rows[0].id}/1.0.0/template.docx`,
      templateDocx(),
    );

    const { generationJobId } = await app.module
      .get(DocumentPreviewService)
      .generate(
        { templateKey: key, variables: { party_name: 'Acme Trading LLC' } },
        {
          userId: user.id,
          email: user.email,
          tenantId: tenant.id,
          role: SystemTenantRole.TENANT_ADMIN,
          sessionId: randomUUID(),
        },
      );

    // What the worker receives: the job the API queued
    const job = await app.module
      .get<Queue>(getQueueToken(QUEUE_NAMES.DOCUMENT_GENERATION))
      .getJob(`generate-${generationJobId}`);
    return {
      tenantId: tenant.id,
      data: job!.data as DocumentGenerationJobData,
    };
  }

  async function documentsOf(tenantId: string): Promise<
    Array<{
      id: string;
      source_type: string;
      s3_key: string;
      s3_bucket: string;
      file_size_bytes: string;
    }>
  > {
    // Read as the tenant, through RLS
    return app.appDatabaseService.transactionWithTenantContext(
      { tenantId },
      async (client) =>
        (
          await client.query<{
            id: string;
            source_type: string;
            s3_key: string;
            s3_bucket: string;
            file_size_bytes: string;
          }>(
            `SELECT id, source_type, s3_key, s3_bucket, file_size_bytes FROM public.documents`,
          )
        ).rows,
    );
  }

  async function job(
    id: string,
  ): Promise<{ status: string; document_id: string | null }> {
    const { rows } = await app.databaseService.query<{
      status: string;
      document_id: string | null;
    }>('SELECT status, document_id FROM public.generation_jobs WHERE id = $1', [
      id,
    ]);
    return rows[0];
  }

  async function documentsUsed(tenantId: string): Promise<number> {
    await waitForQueueIdle(
      app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      30000,
    );
    return (
      await app.module.get(EntitlementEnforcementService).peekUsage({
        tenantId,
        featureKey: 'documents_per_month',
      })
    ).used;
  }

  it('turns a generate request into a stored PDF document', async () => {
    const { tenantId, data } = await requestGeneration();

    await worker.generate(data, 1, 3);

    const documents = await documentsOf(tenantId);
    expect(documents).toHaveLength(1);
    const [document] = documents;
    expect(document).toMatchObject({
      source_type: 'generated',
      s3_bucket: FILES_BUCKET,
    });
    const pdf = s3.objects.get(`${FILES_BUCKET}/${document.s3_key}`);
    expect(pdf?.subarray(0, 5).toString()).toBe('%PDF-');
    expect(Number(document.file_size_bytes)).toBe(pdf!.length);
    expect(await job(data.generationJobId)).toEqual({
      status: 'completed',
      document_id: document.id,
    });
    expect(convertDocxToPdf).toHaveBeenCalledTimes(1);
    // The rendered DOCX carries the variables
    const rendered = new PizZip(convertDocxToPdf.mock.calls[0][0] as Buffer)
      .file('word/document.xml')!
      .asText();
    expect(rendered).toContain('Agreement with Acme Trading LLC');
  });

  it('a retry after a failure past the upload creates no second document or PDF', async () => {
    const { tenantId, data } = await requestGeneration();
    jest
      .spyOn(GenerationJobWriteRepository.prototype, 'markCompleted')
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(worker.generate(data, 1, 3)).rejects.toThrow(
      'connection reset',
    );
    await worker.generate(data, 2, 3);

    const documents = await documentsOf(tenantId);
    expect(documents).toHaveLength(1);
    expect(s3.keys(`${FILES_BUCKET}/tenants/${tenantId}/`)).toEqual([
      `${FILES_BUCKET}/${documents[0].s3_key}`,
    ]);
    expect(await job(data.generationJobId)).toEqual({
      status: 'completed',
      document_id: documents[0].id,
    });
    expect(await documentsUsed(tenantId)).toBe(1);
  });

  it('running a completed job again changes nothing', async () => {
    const { tenantId, data } = await requestGeneration();
    await worker.generate(data, 1, 3);

    await worker.generate(data, 1, 3);

    expect(await documentsOf(tenantId)).toHaveLength(1);
    expect(convertDocxToPdf).toHaveBeenCalledTimes(1);
  });

  it('a job that fails for good gives the document back to the quota', async () => {
    const { tenantId, data } = await requestGeneration();
    expect(await documentsUsed(tenantId)).toBe(1);
    convertDocxToPdf.mockRejectedValue(new Error('Gotenberg unavailable'));

    await expect(worker.generate(data, 3, 3)).rejects.toThrow(
      'Gotenberg unavailable',
    );

    expect((await job(data.generationJobId)).status).toBe('failed');
    expect(await documentsOf(tenantId)).toHaveLength(0);
    expect(await documentsUsed(tenantId)).toBe(0);
  });
});

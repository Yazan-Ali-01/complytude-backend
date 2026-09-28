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
import type { FastifyInstance } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import PizZip from 'pizzip';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import {
  StorageService,
  type UploadResult,
} from 'src/modules/storage/storage.service';
import { DocumentWriteRepository } from '../../../worker-generation/src/repositories/document-write.repository';
import { GenerationJobWriteRepository } from '../../../worker-generation/src/repositories/generation-job-write.repository';
import { DocumentGenerationWorkerService } from '../../../worker-generation/src/services/document-generation.service';
import {
  createTestSubscription,
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { waitForQueueIdle } from '../helpers/queue.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { MockStorageService } from '../mocks/storage.mock';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The templates bucket: what the API uploads is what the worker reads. */
const templatesBucket = new Map<string, Buffer>();

class RecordingStorageService extends MockStorageService {
  async uploadTemplateFile(
    templateId: string,
    version: string,
    file: Buffer,
    originalName: string,
    contentType: string,
    userId: string,
  ): Promise<UploadResult> {
    const key = `templates/${templateId}/${version}/template.docx`;
    templatesBucket.set(key, Buffer.from(file));
    const result = await super.uploadTemplateFile(
      templateId,
      version,
      file,
      originalName,
      contentType,
      userId,
    );
    return { ...result, key, url: `s3://templates/${key}` };
  }

  async getTemplateFile(
    templateId: string,
    version: string,
  ): Promise<Readable> {
    await Promise.resolve();
    return Readable.from([
      templatesBucket.get(`templates/${templateId}/${version}/template.docx`)!,
    ]);
  }
}

function docx(text: string): Buffer {
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
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** A multipart/form-data body with text fields and one DOCX file. */
function multipart(
  fields: Record<string, string>,
  file: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----test${randomUUID()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="template.docx"\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const PARTY_FIELD = JSON.stringify([
  { key: 'party_name', label: 'Party', type: 'text', required: true },
]);

/**
 * Templates API over HTTP, as the app role: a platform admin publishes a template by uploading
 * DOCX files, tenants read the library, and a tenant generates from the uploaded file with no
 * manual S3 step (the worker renders exactly the bytes the API stored).
 */
describe('Templates API', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({
      providers: [
        { provide: StorageService, useClass: RecordingStorageService },
      ],
    });
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    templatesBucket.clear();
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

  async function platformAdmin(): Promise<string> {
    const admin = await createTestUser(app.module, {
      platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
    });
    return login(admin.email);
  }

  /** A Navigator tenant member, signed in to the tenant. */
  async function tenantMember(): Promise<{ tenantId: string; cookie: string }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'navigator',
    });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const identity = await login(user.email);
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: identity },
      payload: { tenantId: tenant.id },
    });
    expect(switched.statusCode).toBe(200);
    // The browser holds both pairs: identity (template library) and tenant (generation)
    return {
      tenantId: tenant.id,
      cookie: `${identity}; ${cookieHeaderFromSetCookie(
        switched.headers as Record<string, string | string[] | undefined>,
      )}`,
    };
  }

  function createTemplate(
    cookie: string,
    key: string,
    file: Buffer,
  ): Promise<InjectResponse> {
    const body = multipart(
      {
        key,
        name: 'Mutual NDA',
        languages: '["en"]',
        fields: PARTY_FIELD,
        tier: 'essential',
      },
      file,
    );
    return server.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: { cookie, ...body.headers },
      payload: body.payload,
    });
  }

  function uploadVersion(
    cookie: string,
    key: string,
    version: string,
    file: Buffer,
  ): Promise<InjectResponse> {
    const body = multipart(
      { version, fields: PARTY_FIELD, changelog: 'Reworded' },
      file,
    );
    return server.inject({
      method: 'POST',
      url: `/api/v1/templates/${key}/versions`,
      headers: { cookie, ...body.headers },
      payload: body.payload,
    });
  }

  function generate(cookie: string, key: string): Promise<InjectResponse> {
    return server.inject({
      method: 'POST',
      url: '/api/v1/documents/generate',
      headers: { cookie },
      payload: {
        templateKey: key,
        variables: { party_name: 'Acme Trading LLC' },
      },
    });
  }

  /** Runs the generation worker on the job the API queued; returns the DOCX it rendered. */
  async function runWorker(generationJobId: string): Promise<string> {
    const job = await app.module
      .get<Queue>(getQueueToken(QUEUE_NAMES.DOCUMENT_GENERATION))
      .getJob(`generate-${generationJobId}`);
    let rendered: Buffer | undefined;
    const s3 = {
      getObjectBuffer: (_bucket: string, key: string) =>
        Promise.resolve(templatesBucket.get(key)!),
      putObject: () => Promise.resolve(),
    };
    const worker = new DocumentGenerationWorkerService(
      new DocxRendererService(),
      {
        convertDocxToPdf: (docx: Buffer) => {
          rendered = docx;
          return Promise.resolve(Buffer.from('%PDF-'));
        },
      } as unknown as PdfConversionService,
      s3 as unknown as S3Service,
      new GenerationJobWriteRepository(app.appDatabaseService),
      new DocumentWriteRepository(),
      { get: () => 'bucket' } as unknown as ConfigService,
      app.module.get(QueueProducerService),
      app.appDatabaseService,
    );

    await worker.generate(job!.data as DocumentGenerationJobData, 1, 3);

    return new PizZip(rendered!).file('word/document.xml')!.asText();
  }

  it('a platform admin publishes a template and a tenant generates from the uploaded DOCX', async () => {
    const admin = await platformAdmin();
    const key = `nda_${randomUUID().slice(0, 8)}`;

    const created = await createTemplate(
      admin,
      key,
      docx('Agreement with {{party_name}}'),
    );
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      key,
      tier: 'essential',
      currentVersion: '1.0.0',
      placeholdersDetected: ['party_name'],
      validation: { isValid: true },
    });

    const version = await uploadVersion(
      admin,
      key,
      '1.1.0',
      docx('Revised agreement with {{party_name}}'),
    );
    expect(version.statusCode).toBe(201);
    expect(version.json()).toMatchObject({ version: '1.1.0', isActive: true });

    // The tenant sees it in the library, at its current version
    const { cookie } = await tenantMember();
    const list = await server.inject({
      method: 'GET',
      url: `/api/v1/templates?search=Mutual`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      data: [{ key, currentVersion: '1.1.0' }],
      meta: { total: 1, page: 1 },
    });
    const detail = await server.inject({
      method: 'GET',
      url: `/api/v1/templates/${key}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      currentVersionData: {
        version: '1.1.0',
        fields: [{ key: 'party_name' }],
      },
    });

    const requested = await generate(cookie, key);
    expect(requested.statusCode).toBe(202);
    const rendered = await runWorker(
      requested.json<{ generationJobId: string }>().generationJobId,
    );

    expect(rendered).toContain('Revised agreement with Acme Trading LLC');
  });

  it('keeps every version: list, fetch one, roll back and download', async () => {
    const admin = await platformAdmin();
    const key = `nda_${randomUUID().slice(0, 8)}`;
    await createTemplate(admin, key, docx('First {{party_name}}'));
    await uploadVersion(admin, key, '1.1.0', docx('Second {{party_name}}'));

    const rollback = await server.inject({
      method: 'POST',
      url: `/api/v1/templates/${key}/versions/1.0.0/rollback`,
      headers: { cookie: admin },
      payload: { newVersion: '1.2.0' },
    });
    expect(rollback.statusCode).toBe(201);
    expect(rollback.json()).toMatchObject({
      version: '1.2.0',
      changelog: 'Rolled back to 1.0.0',
    });

    const versions = await server.inject({
      method: 'GET',
      url: `/api/v1/templates/${key}/versions`,
      headers: { cookie: admin },
    });
    expect(versions.json().data.map((v) => v.version)).toEqual([
      '1.2.0',
      '1.1.0',
      '1.0.0',
    ]);
    const old = await server.inject({
      method: 'GET',
      url: `/api/v1/templates/${key}/versions/1.1.0`,
      headers: { cookie: admin },
    });
    expect(old.json()).toMatchObject({ version: '1.1.0', isActive: false });

    // The rolled-back version renders the first DOCX again
    const { cookie } = await tenantMember();
    const requested = await generate(cookie, key);
    expect(
      await runWorker(
        requested.json<{ generationJobId: string }>().generationJobId,
      ),
    ).toContain('First Acme Trading LLC');

    const download = await server.inject({
      method: 'GET',
      url: `/api/v1/templates/${key}/download?version=1.1.0`,
      headers: { cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.json()).toMatchObject({ filename: `${key}_1.1.0.docx` });
  });

  it('only a platform admin can write templates', async () => {
    const { cookie } = await tenantMember();
    const key = `nda_${randomUUID().slice(0, 8)}`;

    const res = await createTemplate(cookie, key, docx('{{party_name}}'));

    expect(res.statusCode).toBe(403);
    expect(templatesBucket.size).toBe(0);
  });

  it.each([
    [
      'a zip bomb',
      (() => {
        const zip = new PizZip(docx('{{party_name}}'));
        zip.file('word/media/filler.bin', Buffer.alloc(60 * 1024 * 1024));
        return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
      })(),
    ],
    ['a file that is not a DOCX', Buffer.from('%PDF-1.7 not a docx')],
  ])('refuses %s with 400 and stores nothing', async (_name, file) => {
    const admin = await platformAdmin();
    const key = `nda_${randomUUID().slice(0, 8)}`;

    const res = await createTemplate(admin, key, file);

    expect(res.statusCode).toBe(400);
    expect(templatesBucket.size).toBe(0);
    const { rows } = await app.databaseService.query(
      'SELECT id FROM public.templates WHERE key = $1',
      [key],
    );
    expect(rows).toHaveLength(0);
  });

  it('a deactivated template cannot be generated from until it is activated again', async () => {
    const admin = await platformAdmin();
    const key = `nda_${randomUUID().slice(0, 8)}`;
    await createTemplate(admin, key, docx('{{party_name}}'));
    const { cookie } = await tenantMember();

    const deactivated = await server.inject({
      method: 'DELETE',
      url: `/api/v1/templates/${key}`,
      headers: { cookie: admin },
    });
    expect(deactivated.statusCode).toBe(200);
    expect((await generate(cookie, key)).statusCode).toBe(404);

    const activated = await server.inject({
      method: 'POST',
      url: `/api/v1/templates/${key}/activate`,
      headers: { cookie: admin },
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({ status: 'active' });
    expect((await generate(cookie, key)).statusCode).toBe(202);
  });
});

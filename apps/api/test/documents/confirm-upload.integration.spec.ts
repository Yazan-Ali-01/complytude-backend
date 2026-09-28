import { INGESTION_JOB_NAMES, QUEUE_NAMES } from '@lib/queue';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedTenantUser } from 'src/modules/auth/strategies';
import { DocumentsService } from 'src/modules/documents/documents.service';
import { StorageService } from 'src/modules/storage/storage.service';
import { DocumentRepository } from 'src/repositories/documents/document.repository';
import { createTestTenant, createTestUser } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp } from '../setup/test-app.factory';

describe('DocumentsService.confirmUpload', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let documentsService: DocumentsService;
  let documentRepository: DocumentRepository;
  let storageService: StorageService;

  let tenantId: string;
  let userId: string;
  let user: AuthenticatedTenantUser;

  beforeAll(async () => {
    app = await createTestApp();
    documentsService = app.module.get(DocumentsService);
    documentRepository = app.module.get(DocumentRepository);
    storageService = app.module.get(StorageService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);

    const tenant = await createTestTenant(app.module);
    const testUser = await createTestUser(app.module);
    tenantId = tenant.id;
    userId = testUser.id;
    user = {
      userId,
      email: 'test@example.com',
      tenantId,
      role: 'admin',
      sessionId: 'test-tenant-session-id',
    };
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** Fixture rows are written as the superuser (the app itself runs under RLS). */
  function insertDocument(
    data: Parameters<DocumentRepository['create']>[0],
  ): ReturnType<DocumentRepository['create']> {
    return app.databaseService.transaction((client) =>
      documentRepository.create(data, { client }),
    );
  }

  async function createFileUploadDocument(overrides?: Record<string, unknown>) {
    return insertDocument({
      tenant_id: tenantId,
      title: 'test-contract.pdf',
      created_by: userId,
      source_type: 'file_upload',
      s3_key: `tenants/${tenantId}/documents/test-id/test-contract.pdf`,
      s3_bucket: 'mock-quarantine-bucket',
      original_filename: 'test-contract.pdf',
      file_size_bytes: 2048576,
      mime_type: 'application/pdf',
      extraction_status: 'pending',
      ...overrides,
    });
  }

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns 202-style response and enqueues job on valid confirm', async () => {
    const doc = await createFileUploadDocument();
    const enqueueSpy = jest
      .spyOn(app.queueProducerService, 'enqueue')
      .mockResolvedValue({} as any);

    const result = await documentsService.confirmUpload(doc.id, user);

    expect(result.documentId).toBe(doc.id);
    // claimPendingUpload moves the document to 'processing' before the job is enqueued
    expect(result.status).toBe('processing');
    expect(result.message).toBeDefined();

    expect(enqueueSpy).toHaveBeenCalledWith(
      QUEUE_NAMES.DATA_INGESTION,
      INGESTION_JOB_NAMES.DOCUMENT_INGESTION,
      expect.objectContaining({
        documentId: doc.id,
        tenantId,
        s3Key: doc.s3_key,
        s3Bucket: 'mock-quarantine-bucket',
        mimeType: 'application/pdf',
        originalFilename: 'test-contract.pdf',
      }),
      expect.objectContaining({ jobId: `doc-ingestion-${doc.id}` }),
    );

    enqueueSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Error: Document not found (404)
  // -------------------------------------------------------------------------

  it('throws NotFoundException for non-existent document', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(documentsService.confirmUpload(fakeId, user)).rejects.toThrow(
      NotFoundException,
    );
  });

  // -------------------------------------------------------------------------
  // Error: Wrong source_type (400)
  // -------------------------------------------------------------------------

  it('throws BadRequestException for text_input documents', async () => {
    const doc = await insertDocument({
      tenant_id: tenantId,
      title: 'Plain text doc',
      content: 'Some text',
      created_by: userId,
      source_type: 'text_input',
    });

    await expect(documentsService.confirmUpload(doc.id, user)).rejects.toThrow(
      BadRequestException,
    );
  });

  // -------------------------------------------------------------------------
  // Error: Already confirmed / not pending (409)
  // -------------------------------------------------------------------------

  it('throws ConflictException when extraction_status is processing', async () => {
    const doc = await createFileUploadDocument({
      extraction_status: 'processing',
    });

    await expect(documentsService.confirmUpload(doc.id, user)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException when extraction_status is completed', async () => {
    const doc = await createFileUploadDocument({
      extraction_status: 'completed',
    });

    await expect(documentsService.confirmUpload(doc.id, user)).rejects.toThrow(
      ConflictException,
    );
  });

  // -------------------------------------------------------------------------
  // Error: File not found in S3 (400)
  // -------------------------------------------------------------------------

  it('throws BadRequestException when file not found in quarantine bucket', async () => {
    const doc = await createFileUploadDocument();
    const metaSpy = jest
      .spyOn(storageService, 'getQuarantineObjectMetadata')
      .mockResolvedValue(null);

    await expect(documentsService.confirmUpload(doc.id, user)).rejects.toThrow(
      BadRequestException,
    );

    metaSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Error: File size mismatch (400)
  // -------------------------------------------------------------------------

  it('throws BadRequestException when file size is wildly different', async () => {
    const doc = await createFileUploadDocument({ file_size_bytes: 2048576 });
    const metaSpy = jest
      .spyOn(storageService, 'getQuarantineObjectMetadata')
      .mockResolvedValue({
        contentLength: 999,
        contentType: 'application/pdf',
      });

    await expect(documentsService.confirmUpload(doc.id, user)).rejects.toThrow(
      BadRequestException,
    );

    metaSpy.mockRestore();
  });

  it('passes when file size is within tolerance', async () => {
    const declaredSize = 2048576;
    const withinTolerance = declaredSize + 1000; // well within 1% (~20K)
    const doc = await createFileUploadDocument({
      file_size_bytes: declaredSize,
    });
    const metaSpy = jest
      .spyOn(storageService, 'getQuarantineObjectMetadata')
      .mockResolvedValue({
        contentLength: withinTolerance,
        contentType: 'application/pdf',
      });
    const enqueueSpy = jest
      .spyOn(app.queueProducerService, 'enqueue')
      .mockResolvedValue({} as any);

    const result = await documentsService.confirmUpload(doc.id, user);
    expect(result.documentId).toBe(doc.id);

    metaSpy.mockRestore();
    enqueueSpy.mockRestore();
  });
});

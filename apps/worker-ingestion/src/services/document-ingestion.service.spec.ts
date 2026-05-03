/* eslint-disable @typescript-eslint/unbound-method */
import { PermanentError, RetryableError } from '@lib/queue';
import type { DocumentIngestionJobData } from '@lib/queue';
import { DocumentIngestionService } from './document-ingestion.service';
import type { DocumentWriteRepository } from '../repositories/document-write.repository';
import type { DocumentRow } from '../repositories/document-write.repository';
import type { ITextractService } from '../interfaces/textract.interface';
import type { IS3PromotionService } from '../interfaces/s3-promotion.interface';

const MOCK_JOB_DATA: DocumentIngestionJobData = {
  documentId: 'doc-123',
  tenantId: 'tenant-456',
  s3Key: 'tenants/tenant-456/documents/doc-123/file.pdf',
  s3Bucket: 'complytude-quarantine',
  originalFilename: 'file.pdf',
  mimeType: 'application/pdf',
};

function makeDocumentRow(overrides?: Partial<DocumentRow>): DocumentRow {
  return {
    id: 'doc-123',
    tenant_id: 'tenant-456',
    title: 'file.pdf',
    content: null,
    content_structured: null,
    source_type: 'file_upload',
    s3_key: 'tenants/tenant-456/documents/doc-123/file.pdf',
    s3_bucket: 'complytude-quarantine',
    original_filename: 'file.pdf',
    mime_type: 'application/pdf',
    extraction_status: 'processing',
    extraction_error: null,
    extracted_at: null,
    ...overrides,
  };
}

describe('DocumentIngestionService', () => {
  let service: DocumentIngestionService;
  let repo: jest.Mocked<DocumentWriteRepository>;
  let textract: jest.Mocked<ITextractService>;
  let promotion: jest.Mocked<IS3PromotionService>;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      storeExtractedContent: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<DocumentWriteRepository>;

    textract = {
      extractText: jest.fn(),
    } as jest.Mocked<ITextractService>;

    promotion = {
      promote: jest.fn(),
    } as jest.Mocked<IS3PromotionService>;

    service = new DocumentIngestionService(repo, textract, promotion);
  });

  describe('process — happy path', () => {
    it('should extract text, store content, promote file, and mark completed', async () => {
      repo.findById.mockResolvedValue(makeDocumentRow());
      textract.extractText.mockResolvedValue({
        text: 'Extracted document content',
        sections: [],
        pageCount: 3,
      });
      promotion.promote.mockResolvedValue({
        bucket: 'complytude-files',
        key: 'tenants/tenant-456/documents/doc-123/file.pdf',
      });
      repo.storeExtractedContent.mockResolvedValue(undefined);
      repo.markCompleted.mockResolvedValue(undefined);

      await service.process(MOCK_JOB_DATA);

      expect(repo.findById).toHaveBeenCalledWith('doc-123');
      expect(textract.extractText).toHaveBeenCalledWith(
        'complytude-quarantine',
        'tenants/tenant-456/documents/doc-123/file.pdf',
        'application/pdf',
      );
      expect(repo.storeExtractedContent).toHaveBeenCalledWith(
        'doc-123',
        'Extracted document content',
        [],
      );
      expect(promotion.promote).toHaveBeenCalledWith(
        'complytude-quarantine',
        'tenants/tenant-456/documents/doc-123/file.pdf',
      );
      expect(repo.markCompleted).toHaveBeenCalledWith(
        'doc-123',
        'complytude-files',
        'tenants/tenant-456/documents/doc-123/file.pdf',
      );
    });

    it('should skip textract when content is already stored (retry path)', async () => {
      repo.findById.mockResolvedValue(
        makeDocumentRow({ content: 'Previously extracted text' }),
      );
      promotion.promote.mockResolvedValue({
        bucket: 'complytude-files',
        key: 'tenants/tenant-456/documents/doc-123/file.pdf',
      });
      repo.markCompleted.mockResolvedValue(undefined);

      await service.process(MOCK_JOB_DATA);

      expect(textract.extractText).not.toHaveBeenCalled();
      expect(repo.storeExtractedContent).not.toHaveBeenCalled();
      expect(promotion.promote).toHaveBeenCalled();
      expect(repo.markCompleted).toHaveBeenCalled();
    });
  });

  describe('process — error paths', () => {
    it('should throw PermanentError when document not found', async () => {
      repo.findById.mockResolvedValue(null);

      const error = await service
        .process(MOCK_JOB_DATA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PermanentError);
      expect((error as Error).message).toMatch(/not found/);
    });

    it('should throw PermanentError when document already completed', async () => {
      repo.findById.mockResolvedValue(
        makeDocumentRow({ extraction_status: 'completed' }),
      );

      const error = await service
        .process(MOCK_JOB_DATA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PermanentError);
      expect((error as Error).message).toMatch(/already completed/);
    });

    it('should throw PermanentError when document already failed', async () => {
      repo.findById.mockResolvedValue(
        makeDocumentRow({ extraction_status: 'failed' }),
      );

      const error = await service
        .process(MOCK_JOB_DATA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PermanentError);
      expect((error as Error).message).toMatch(/already failed/);
    });

    it('should throw PermanentError when textract returns empty text', async () => {
      repo.findById.mockResolvedValue(makeDocumentRow());
      textract.extractText.mockResolvedValue({
        text: '',
        sections: [],
        pageCount: 0,
      });

      const error = await service
        .process(MOCK_JOB_DATA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PermanentError);
      expect((error as Error).message).toMatch(/no text/);
    });

    it('should throw RetryableError when DB fetch fails', async () => {
      repo.findById.mockRejectedValue(new Error('connection timeout'));

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );
    });
  });

  describe('markFailed', () => {
    it('should delegate to repository', async () => {
      repo.markFailed.mockResolvedValue(undefined);

      await service.markFailed('doc-123', 'Something went wrong');

      expect(repo.markFailed).toHaveBeenCalledWith(
        'doc-123',
        'Something went wrong',
      );
    });

    it('should not throw when repository fails', async () => {
      repo.markFailed.mockRejectedValue(new Error('DB down'));

      await expect(
        service.markFailed('doc-123', 'error'),
      ).resolves.not.toThrow();
    });
  });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { PermanentError, RetryableError } from '@lib/queue';
import type { DocumentIngestionJobData } from '@lib/queue';
import { DocumentIngestionService } from './document-ingestion.service';
import type { DocumentWriteRepository } from '../repositories/document-write.repository';
import type { DocumentRow } from '../repositories/document-write.repository';
import {
  TextractJobFailedError,
  type ITextractService,
} from '../interfaces/textract.interface';
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
    textract_job_id: null,
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
      storeExtractedContent: jest.fn().mockResolvedValue(undefined),
      setTextractJobId: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<DocumentWriteRepository>;

    textract = {
      startAnalysis: jest.fn().mockResolvedValue('textract-job-1'),
      collectResult: jest.fn(),
    } as jest.Mocked<ITextractService>;

    promotion = {
      promote: jest.fn(),
    } as jest.Mocked<IS3PromotionService>;

    service = new DocumentIngestionService(repo, textract, promotion);
  });

  describe('process — happy path', () => {
    it('should extract text, store content, promote file, and mark completed', async () => {
      repo.findById.mockResolvedValue(makeDocumentRow());
      textract.collectResult.mockResolvedValue({
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

      expect(repo.findById).toHaveBeenCalledWith('tenant-456', 'doc-123');
      expect(textract.startAnalysis).toHaveBeenCalledWith(
        'complytude-quarantine',
        'tenants/tenant-456/documents/doc-123/file.pdf',
        'application/pdf',
      );
      expect(repo.setTextractJobId).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'textract-job-1',
      );
      expect(textract.collectResult).toHaveBeenCalledWith('textract-job-1');
      expect(repo.storeExtractedContent).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'Extracted document content',
        [],
      );
      expect(promotion.promote).toHaveBeenCalledWith(
        'complytude-quarantine',
        'tenants/tenant-456/documents/doc-123/file.pdf',
      );
      expect(repo.markCompleted).toHaveBeenCalledWith(
        'tenant-456',
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

      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(textract.collectResult).not.toHaveBeenCalled();
      expect(repo.storeExtractedContent).not.toHaveBeenCalled();
      expect(promotion.promote).toHaveBeenCalled();
      expect(repo.markCompleted).toHaveBeenCalled();
    });
  });

  describe('process — one Textract job per document', () => {
    const extracted = { text: 'Extracted', sections: [], pageCount: 1 };

    beforeEach(() => {
      promotion.promote.mockResolvedValue({ bucket: 'b', key: 'k' });
    });

    it('resumes the stored job on a retry instead of starting (and paying for) another', async () => {
      repo.findById.mockResolvedValue(
        makeDocumentRow({ textract_job_id: 'textract-job-1' }),
      );
      textract.collectResult.mockResolvedValue(extracted);

      await service.process(MOCK_JOB_DATA);

      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(textract.collectResult).toHaveBeenCalledWith('textract-job-1');
    });

    it('a poll timeout and its retry start one job in total', async () => {
      let stored: string | null = null;
      repo.setTextractJobId.mockImplementation((_tenant, _id, jobId) => {
        stored = jobId;
        return Promise.resolve();
      });
      repo.findById.mockImplementation(() =>
        Promise.resolve(makeDocumentRow({ textract_job_id: stored })),
      );
      textract.collectResult
        .mockRejectedValueOnce(new RetryableError('did not complete in time'))
        .mockResolvedValueOnce(extracted);

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );
      await service.process(MOCK_JOB_DATA);

      expect(textract.startAnalysis).toHaveBeenCalledTimes(1);
      expect(textract.collectResult).toHaveBeenCalledTimes(2);
    });

    it('forgets a job that itself failed, so the retry starts a new one', async () => {
      repo.findById.mockResolvedValue(
        makeDocumentRow({ textract_job_id: 'textract-job-1' }),
      );
      textract.collectResult.mockRejectedValue(
        new TextractJobFailedError('Textract job textract-job-1 FAILED'),
      );

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );

      expect(repo.setTextractJobId).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        null,
      );
    });

    it('an over-limit PDF fails for good without a Textract job', async () => {
      repo.findById.mockResolvedValue(makeDocumentRow());
      textract.startAnalysis.mockRejectedValue(
        new PermanentError(
          'Document has 400 pages, exceeding the maximum of 50',
        ),
      );

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        PermanentError,
      );
      expect(repo.setTextractJobId).not.toHaveBeenCalled();
      expect(textract.collectResult).not.toHaveBeenCalled();
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
      textract.collectResult.mockResolvedValue({
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

    it.each([
      ['bucket', { s3Bucket: 'attacker-bucket' }],
      ['key', { s3Key: 'tenants/other/documents/x/file.pdf' }],
      ['mime type', { mimeType: 'image/tiff' }],
    ])(
      'refuses a payload whose %s differs from the document, before Textract',
      async (_field, override) => {
        repo.findById.mockResolvedValue(makeDocumentRow());

        const error = await service
          .process({ ...MOCK_JOB_DATA, ...override })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(PermanentError);
        expect(textract.startAnalysis).not.toHaveBeenCalled();
        expect(promotion.promote).not.toHaveBeenCalled();
      },
    );

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

      await service.markFailed('tenant-456', 'doc-123', 'Something went wrong');

      expect(repo.markFailed).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'Something went wrong',
      );
    });

    it('should not throw when repository fails', async () => {
      repo.markFailed.mockRejectedValue(new Error('DB down'));

      await expect(
        service.markFailed('tenant-456', 'doc-123', 'error'),
      ).resolves.not.toThrow();
    });
  });
});

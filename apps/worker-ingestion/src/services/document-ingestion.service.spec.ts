/* eslint-disable @typescript-eslint/unbound-method */
import { countPdfPages, pagesWithImages } from '@lib/pdf';
import { pdfWith } from '@lib/pdf/testing/pdf-fixtures';
import { PermanentError, RetryableError } from '@lib/queue';
import type { DocumentIngestionJobData } from '@lib/queue';
import type { S3Service } from '@lib/storage';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DocumentIngestionService,
  OCR_PAGES_PREFIX,
} from './document-ingestion.service';
import type { DocumentWriteRepository } from '../repositories/document-write.repository';
import type { DocumentRow } from '../repositories/document-write.repository';
import {
  TextractJobFailedError,
  type DocumentSection,
  type ITextractService,
  type TextractResult,
} from '../interfaces/textract.interface';
import type { IS3PromotionService } from '../interfaces/s3-promotion.interface';

const QUARANTINE = 'complytude-quarantine';
const KEY = 'tenants/tenant-456/documents/doc-123/file.pdf';
const OCR_KEY = `${OCR_PAGES_PREFIX}tenant-456/doc-123.pdf`;

const MOCK_JOB_DATA: DocumentIngestionJobData = {
  documentId: 'doc-123',
  tenantId: 'tenant-456',
  s3Key: KEY,
  s3Bucket: QUARANTINE,
  originalFilename: 'file.pdf',
  mimeType: 'application/pdf',
};

const DEMO = join(__dirname, '../../../../data/test-documents');

/** Enough text for a page of a real contract's text layer. */
const PAGE_ONE = [
  'EMPLOYMENT AGREEMENT',
  'The Employee shall work forty-eight hours a week at the Dubai office.',
];
const PAGE_THREE = [
  'The Employee is entitled to thirty days of paid annual leave each year.',
];

function makeDocumentRow(overrides?: Partial<DocumentRow>): DocumentRow {
  return {
    id: 'doc-123',
    tenant_id: 'tenant-456',
    title: 'file.pdf',
    content: null,
    content_structured: null,
    source_type: 'file_upload',
    s3_key: KEY,
    s3_bucket: QUARANTINE,
    original_filename: 'file.pdf',
    mime_type: 'application/pdf',
    extraction_status: 'processing',
    extraction_error: null,
    extracted_at: null,
    textract_job_id: null,
    ocr_pages: null,
    ...overrides,
  };
}

/** Textract's reading of a one-page file. */
const OCRED: TextractResult = {
  items: [{ kind: 'text', text: 'Salary is AED 18,000 per month.', page: 1 }],
  pageCount: 1,
};

describe('DocumentIngestionService', () => {
  let service: DocumentIngestionService;
  let repo: jest.Mocked<DocumentWriteRepository>;
  let textract: jest.Mocked<ITextractService>;
  let promotion: jest.Mocked<IS3PromotionService>;
  let s3: jest.Mocked<S3Service>;

  /** What was stored: flat text, sections, OCR pages. */
  function stored(): {
    text: string;
    sections: DocumentSection[];
    ocrPages: number[];
  } {
    const [, , text, sections, ocrPages] =
      repo.storeExtractedContent.mock.calls[0];
    return { text, sections, ocrPages };
  }

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(makeDocumentRow()),
      storeExtractedContent: jest.fn().mockResolvedValue(undefined),
      setTextractJob: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<DocumentWriteRepository>;

    textract = {
      startAnalysis: jest.fn().mockResolvedValue('textract-job-1'),
      collectResult: jest.fn().mockResolvedValue(OCRED),
    } as jest.Mocked<ITextractService>;

    promotion = {
      promote: jest
        .fn()
        .mockResolvedValue({ bucket: 'complytude-files', key: KEY }),
    } as jest.Mocked<IS3PromotionService>;

    s3 = {
      getObjectBuffer: jest.fn(),
      putObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<S3Service>;

    service = withPageLimit(50);
  });

  function withPageLimit(maxPages: number): DocumentIngestionService {
    return new DocumentIngestionService(
      repo,
      textract,
      promotion,
      s3,
      new ConfigService({ textract: { maxPages, minTextCharsPerPage: 50 } }),
    );
  }

  function upload(pdf: Uint8Array): void {
    s3.getObjectBuffer.mockResolvedValue(Buffer.from(pdf));
  }

  describe('a born-digital PDF', () => {
    it('reads the demo contract locally: no Textract call, the sections of its source', async () => {
      upload(readFileSync(join(DEMO, 'dmcc_test_shareholders_agreement.pdf')));

      await service.process(MOCK_JOB_DATA);

      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(textract.collectResult).not.toHaveBeenCalled();
      expect(s3.putObject).not.toHaveBeenCalled();
      const { text, sections, ocrPages } = stored();
      expect(ocrPages).toEqual([]);
      // The document the PDF was made from: its headings are the sections a reader sees
      const source = readFileSync(
        join(DEMO, 'dmcc_test_shareholders_agreement.md'),
        'utf8',
      );
      const headings = source
        .split('\n')
        .filter((line) => line.startsWith('#'))
        .map((line) => line.replace(/^#+\s*/, ''));
      expect(sections.map((s) => s.heading)).toEqual(headings);
      expect(sections[0]).toMatchObject({ level: 0, pageStart: 1 });
      expect(
        sections.find((s) => s.heading === '1.4 Bearer Share Certificates'),
      ).toMatchObject({
        pageStart: 2,
        content:
          'To provide flexibility in share transfer, the Company shall issue bearer share certificates to each Shareholder. Bearer shares shall be freely transferable by delivery of the physical certificate without the need for registration or notification to the Registrar.',
      });
      expect(text).toContain('Date: 15 March 2026');
      expect(promotion.promote).toHaveBeenCalledWith(QUARANTINE, KEY);
      expect(repo.markCompleted).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'complytude-files',
        KEY,
      );
    });

    it('leaves a nearly empty page without an image alone (a blank page is not a scan)', async () => {
      upload(await pdfWith([PAGE_ONE, [], PAGE_THREE]));

      await service.process(MOCK_JOB_DATA);

      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(stored().ocrPages).toEqual([]);
    });

    it('reads a short document with little text locally', async () => {
      upload(await pdfWith([['Receipt: AED 500 paid in full.']]));

      await service.process(MOCK_JOB_DATA);

      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({
        text: 'Receipt: AED 500 paid in full.',
        ocrPages: [],
      });
    });

    it('skips extraction when content is already stored (retry path)', async () => {
      repo.findById.mockResolvedValue(
        makeDocumentRow({ content: 'Previously extracted text' }),
      );

      await service.process(MOCK_JOB_DATA);

      expect(s3.getObjectBuffer).not.toHaveBeenCalled();
      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(repo.storeExtractedContent).not.toHaveBeenCalled();
      expect(promotion.promote).toHaveBeenCalled();
      expect(repo.markCompleted).toHaveBeenCalled();
    });
  });

  describe('a PDF with a scanned page', () => {
    it('sends only that page to Textract and merges its text back in page order', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));

      await service.process(MOCK_JOB_DATA);

      // A one-page PDF of the scan, in quarantine under the OCR prefix
      expect(s3.putObject).toHaveBeenCalledTimes(1);
      const [bucket, key, body, contentType] = s3.putObject.mock.calls[0];
      expect([bucket, key, contentType]).toEqual([
        QUARANTINE,
        OCR_KEY,
        'application/pdf',
      ]);
      await expect(countPdfPages(body)).resolves.toBe(1);
      await expect(pagesWithImages(body, [1])).resolves.toEqual([1]);
      expect(textract.startAnalysis).toHaveBeenCalledTimes(1);
      expect(textract.startAnalysis).toHaveBeenCalledWith(
        QUARANTINE,
        OCR_KEY,
        'application/pdf',
      );
      expect(repo.setTextractJob).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'textract-job-1',
        [2],
      );

      const { text, ocrPages } = stored();
      expect(ocrPages).toEqual([2]);
      expect(text).toBe(
        [
          'EMPLOYMENT AGREEMENT',
          'The Employee shall work forty-eight hours a week at the Dubai office.',
          'Salary is AED 18,000 per month.',
          'The Employee is entitled to thirty days of paid annual leave each year.',
        ].join('\n'),
      );
      expect(s3.deleteObject).toHaveBeenCalledWith(QUARANTINE, OCR_KEY);
      // The upload itself is never overwritten, and it is what gets promoted
      expect(promotion.promote).toHaveBeenCalledWith(QUARANTINE, KEY);
    });

    it('resumes the stored job on a retry, over the pages it was given, instead of paying for another', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));
      repo.findById.mockResolvedValue(
        makeDocumentRow({ textract_job_id: 'textract-job-1', ocr_pages: [2] }),
      );

      await service.process(MOCK_JOB_DATA);

      expect(s3.putObject).not.toHaveBeenCalled();
      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(textract.collectResult).toHaveBeenCalledWith('textract-job-1');
      expect(stored().text.split('\n')[2]).toBe(
        'Salary is AED 18,000 per month.',
      );
    });

    it('a poll timeout and its retry start one job in total', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));
      let job: Pick<DocumentRow, 'textract_job_id' | 'ocr_pages'> = {
        textract_job_id: null,
        ocr_pages: null,
      };
      repo.setTextractJob.mockImplementation((_tenant, _id, jobId, pages) => {
        job = { textract_job_id: jobId, ocr_pages: pages };
        return Promise.resolve();
      });
      repo.findById.mockImplementation(() =>
        Promise.resolve(makeDocumentRow(job)),
      );
      textract.collectResult
        .mockRejectedValueOnce(new RetryableError('did not complete in time'))
        .mockResolvedValueOnce(OCRED);

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );
      await service.process(MOCK_JOB_DATA);

      expect(textract.startAnalysis).toHaveBeenCalledTimes(1);
      expect(textract.collectResult).toHaveBeenCalledTimes(2);
      expect(stored().ocrPages).toEqual([2]);
    });

    it('resumes a job stored before local reading as a job over the whole file', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan']));
      repo.findById.mockResolvedValue(
        makeDocumentRow({ textract_job_id: 'textract-job-0', ocr_pages: null }),
      );
      textract.collectResult.mockResolvedValue({
        items: [
          { kind: 'text', text: 'Whole file, page one.', page: 1 },
          { kind: 'text', text: 'Whole file, page two.', page: 2 },
        ],
        pageCount: 2,
      });

      await service.process(MOCK_JOB_DATA);

      expect(stored()).toMatchObject({
        text: 'Whole file, page one.\nWhole file, page two.',
        ocrPages: [1, 2],
      });
      expect(s3.deleteObject).not.toHaveBeenCalled();
    });

    it('forgets a job that itself failed, with its pages, so the retry starts a new one', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan']));
      repo.findById.mockResolvedValue(
        makeDocumentRow({ textract_job_id: 'textract-job-1', ocr_pages: [2] }),
      );
      textract.collectResult.mockRejectedValue(
        new TextractJobFailedError('Textract job textract-job-1 FAILED'),
      );

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );

      expect(repo.setTextractJob).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        null,
        null,
      );
    });

    it('OCRs every page of a PDF whose text layer holds no text at all', async () => {
      upload(await pdfWith([[], []]));
      textract.collectResult.mockResolvedValue({
        items: [
          { kind: 'text', text: 'Outlined text, page one.', page: 1 },
          { kind: 'text', text: 'Outlined text, page two.', page: 2 },
        ],
        pageCount: 2,
      });

      await service.process(MOCK_JOB_DATA);

      expect(repo.setTextractJob).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'textract-job-1',
        [1, 2],
      );
      expect(stored().text).toBe(
        'Outlined text, page one.\nOutlined text, page two.',
      );
    });
  });

  describe('an image upload', () => {
    it('goes to Textract whole: it has no text layer', async () => {
      const image = { ...MOCK_JOB_DATA, mimeType: 'image/png' };
      repo.findById.mockResolvedValue(
        makeDocumentRow({ mime_type: 'image/png' }),
      );

      await service.process(image);

      expect(s3.getObjectBuffer).not.toHaveBeenCalled();
      expect(s3.putObject).not.toHaveBeenCalled();
      expect(textract.startAnalysis).toHaveBeenCalledWith(
        QUARANTINE,
        KEY,
        'image/png',
      );
      expect(repo.setTextractJob).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'textract-job-1',
        null,
      );
      expect(stored()).toMatchObject({
        text: 'Salary is AED 18,000 per month.',
        ocrPages: [1],
      });
    });
  });

  describe('process — error paths', () => {
    it('fails an over-limit PDF for good, before reading it or calling Textract', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));

      await expect(withPageLimit(2).process(MOCK_JOB_DATA)).rejects.toThrow(
        /3 pages, exceeding the maximum of 2/,
      );
      expect(s3.putObject).not.toHaveBeenCalled();
      expect(textract.startAnalysis).not.toHaveBeenCalled();
      expect(repo.storeExtractedContent).not.toHaveBeenCalled();
    });

    it('fails a file that is not a readable PDF for good', async () => {
      s3.getObjectBuffer.mockResolvedValue(Buffer.from('not a pdf at all'));

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        PermanentError,
      );
      expect(textract.startAnalysis).not.toHaveBeenCalled();
    });

    it('retries when the file cannot be read from storage', async () => {
      s3.getObjectBuffer.mockRejectedValue(new Error('S3 timeout'));

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );
    });

    it('fails a document with no text in its layer or from OCR', async () => {
      upload(await pdfWith(['scan']));
      textract.collectResult.mockResolvedValue({ items: [], pageCount: 1 });

      const error = await service
        .process(MOCK_JOB_DATA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PermanentError);
      expect((error as Error).message).toMatch(/has no text/);
    });

    it('should throw PermanentError when document not found', async () => {
      repo.findById.mockResolvedValue(null);

      const error = await service
        .process(MOCK_JOB_DATA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PermanentError);
      expect((error as Error).message).toMatch(/not found/);
    });

    it.each(['completed', 'failed'] as const)(
      'should throw PermanentError when document already %s',
      async (status) => {
        repo.findById.mockResolvedValue(
          makeDocumentRow({ extraction_status: status }),
        );

        const error = await service
          .process(MOCK_JOB_DATA)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PermanentError);
        expect((error as Error).message).toMatch(`already ${status}`);
      },
    );

    it.each([
      ['bucket', { s3Bucket: 'attacker-bucket' }],
      ['key', { s3Key: 'tenants/other/documents/x/file.pdf' }],
      ['mime type', { mimeType: 'image/tiff' }],
    ])(
      'refuses a payload whose %s differs from the document, before reading the file',
      async (_field, override) => {
        const error = await service
          .process({ ...MOCK_JOB_DATA, ...override })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(PermanentError);
        expect(s3.getObjectBuffer).not.toHaveBeenCalled();
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

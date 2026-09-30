/* eslint-disable @typescript-eslint/unbound-method */
import { countPdfPages, pagesWithImages } from '@lib/pdf';
import { pdfWith } from '@lib/pdf/testing/pdf-fixtures';
import {
  ENTITLEMENT_JOB_NAMES,
  PermanentError,
  QUEUE_NAMES,
  RetryableError,
  type QueueProducerService,
} from '@lib/queue';
import type { DocumentIngestionJobData } from '@lib/queue';
import type { S3Service } from '@lib/storage';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentIngestionService } from './document-ingestion.service';
import type {
  AnalyzeOperation,
  DocumentIntelligenceClient,
} from './document-intelligence.client';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { readTextLayer } from './pdf-text-layer';
import type { DocumentWriteRepository } from '../repositories/document-write.repository';
import type { DocumentRow } from '../repositories/document-write.repository';
import {
  OcrOperationLostError,
  type DocumentSection,
  type IOcrService,
  type OcrResult,
} from '../interfaces/ocr.interface';
import type { IS3PromotionService } from '../interfaces/s3-promotion.interface';

const QUARANTINE = 'complytude-quarantine';
const KEY = 'tenants/tenant-456/documents/doc-123/file.pdf';

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
    ocr_operation_id: null,
    ocr_pages: null,
    ...overrides,
  };
}

/** OCR's reading of a one-page file. */
const OCRED: OcrResult = {
  items: [{ kind: 'text', text: 'Salary is AED 18,000 per month.', page: 1 }],
  pageCount: 1,
};

describe('DocumentIngestionService', () => {
  let service: DocumentIngestionService;
  let repo: jest.Mocked<DocumentWriteRepository>;
  let ocr: jest.Mocked<IOcrService>;
  let promotion: jest.Mocked<IS3PromotionService>;
  let s3: jest.Mocked<S3Service>;
  let producer: jest.Mocked<QueueProducerService>;

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
      setOcrOperation: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<DocumentWriteRepository>;

    ocr = {
      start: jest.fn().mockResolvedValue('ocr-operation-1'),
      collect: jest.fn().mockResolvedValue(OCRED),
    } as jest.Mocked<IOcrService>;

    promotion = {
      promote: jest
        .fn()
        .mockResolvedValue({ bucket: 'complytude-files', key: KEY }),
    } as jest.Mocked<IS3PromotionService>;

    s3 = {
      getObjectBuffer: jest.fn(),
      putObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<S3Service>;

    producer = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<QueueProducerService>;

    service = withPageLimit(50);
  });

  function withPageLimit(maxPages: number): DocumentIngestionService {
    return new DocumentIngestionService(
      repo,
      ocr,
      promotion,
      s3,
      new ConfigService({ ocr: { maxPages, minTextCharsPerPage: 50 } }),
      producer,
    );
  }

  function upload(pdf: Uint8Array): void {
    s3.getObjectBuffer.mockResolvedValue(Buffer.from(pdf));
  }

  describe('a born-digital PDF', () => {
    it('reads the demo contract locally: no OCR call, the sections of its source', async () => {
      upload(readFileSync(join(DEMO, 'dmcc_test_shareholders_agreement.pdf')));

      await service.process(MOCK_JOB_DATA);

      expect(ocr.start).not.toHaveBeenCalled();
      expect(ocr.collect).not.toHaveBeenCalled();
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

      expect(ocr.start).not.toHaveBeenCalled();
      expect(stored().ocrPages).toEqual([]);
    });

    it('reads a short document with little text locally', async () => {
      upload(await pdfWith([['Receipt: AED 500 paid in full.']]));

      await service.process(MOCK_JOB_DATA);

      expect(ocr.start).not.toHaveBeenCalled();
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
      expect(ocr.start).not.toHaveBeenCalled();
      expect(repo.storeExtractedContent).not.toHaveBeenCalled();
      expect(promotion.promote).toHaveBeenCalled();
      expect(repo.markCompleted).toHaveBeenCalled();
    });
  });

  describe('a PDF with a scanned page', () => {
    it('sends only that page to OCR, as bytes, and merges its text back in page order', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));

      await service.process(MOCK_JOB_DATA);

      // A one-page PDF of the scan, sent as bytes: nothing is written to storage for OCR
      expect(ocr.start).toHaveBeenCalledTimes(1);
      const [sentPdf] = ocr.start.mock.calls[0];
      await expect(countPdfPages(sentPdf)).resolves.toBe(1);
      await expect(pagesWithImages(sentPdf, [1])).resolves.toEqual([1]);
      expect(s3.putObject).not.toHaveBeenCalled();
      expect(repo.setOcrOperation).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'ocr-operation-1',
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
      // The upload itself is never overwritten, and it is what gets promoted
      expect(promotion.promote).toHaveBeenCalledWith(QUARANTINE, KEY);
    });

    it('reads a scanned Arabic page with Document Intelligence: only that page is sent, the rest never leaves', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));
      // What prebuilt-layout returns for the scan: an Arabic heading and clause, and a page number
      const arabic: AnalyzeOperation = {
        status: 'succeeded',
        analyzeResult: {
          pages: [
            { pageNumber: 1, words: [{ content: 'الراتب', confidence: 0.98 }] },
          ],
          paragraphs: [
            {
              role: 'sectionHeading',
              content: 'المادة 2: الراتب',
              boundingRegions: [{ pageNumber: 1 }],
              spans: [{ offset: 0, length: 16 }],
            },
            {
              content: 'يتقاضى الموظف راتباً شهرياً قدره 18,000 درهم.',
              boundingRegions: [{ pageNumber: 1 }],
              spans: [{ offset: 17, length: 45 }],
            },
            {
              role: 'pageNumber',
              content: '2',
              boundingRegions: [{ pageNumber: 1 }],
              spans: [{ offset: 63, length: 1 }],
            },
          ],
        },
      };
      const sent: Uint8Array[] = [];
      const client = {
        analyze: jest.fn((pdf: Uint8Array) => {
          sent.push(pdf);
          return Promise.resolve('result-ar');
        }),
        getResult: jest
          .fn()
          .mockResolvedValueOnce({ status: 'running' })
          .mockResolvedValueOnce(arabic),
        deleteResult: jest.fn().mockResolvedValue(undefined),
      };
      const ingestion = new DocumentIngestionService(
        repo,
        new DocumentIntelligenceService(
          client as unknown as DocumentIntelligenceClient,
          new ConfigService({ ocr: { pollInitialDelayMs: 0 } }),
        ),
        promotion,
        s3,
        new ConfigService({ ocr: { maxPages: 50, minTextCharsPerPage: 50 } }),
        producer,
      );

      await ingestion.process(MOCK_JOB_DATA);

      // One analysis, of a one-page PDF holding the scan and none of the text pages
      expect(sent).toHaveLength(1);
      await expect(countPdfPages(sent[0])).resolves.toBe(1);
      await expect(pagesWithImages(sent[0], [1])).resolves.toEqual([1]);
      expect((await readTextLayer(sent[0]))[0].usableChars).toBe(0);
      expect(client.deleteResult).toHaveBeenCalledWith('result-ar');
      expect(repo.setOcrOperation).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'result-ar',
        [2],
      );

      const { text, sections, ocrPages } = stored();
      expect(ocrPages).toEqual([2]);
      const clause = sections.find((s) => s.heading === 'المادة 2: الراتب');
      expect(clause?.pageStart).toBe(2);
      expect(clause?.content.split('\n')[0]).toBe(
        'يتقاضى الموظف راتباً شهرياً قدره 18,000 درهم.',
      );
      // Page order kept: page 1, the scan, page 3; the scan's page number dropped
      expect(text.indexOf('forty-eight')).toBeLessThan(text.indexOf('الراتب'));
      expect(text.indexOf('الراتب')).toBeLessThan(text.indexOf('thirty days'));
      expect(text.split('\n')).not.toContain('2');
    });

    it('resumes the stored operation on a retry, over the pages it was given, instead of paying for another', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));
      repo.findById.mockResolvedValue(
        makeDocumentRow({
          ocr_operation_id: 'ocr-operation-1',
          ocr_pages: [2],
        }),
      );

      await service.process(MOCK_JOB_DATA);

      expect(ocr.start).not.toHaveBeenCalled();
      expect(ocr.collect).toHaveBeenCalledWith('ocr-operation-1');
      expect(stored().text.split('\n')[2]).toBe(
        'Salary is AED 18,000 per month.',
      );
    });

    it('a poll timeout and its retry start one analysis in total', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));
      let operation: Pick<DocumentRow, 'ocr_operation_id' | 'ocr_pages'> = {
        ocr_operation_id: null,
        ocr_pages: null,
      };
      repo.setOcrOperation.mockImplementation((_tenant, _id, id, pages) => {
        operation = { ocr_operation_id: id, ocr_pages: pages };
        return Promise.resolve();
      });
      repo.findById.mockImplementation(() =>
        Promise.resolve(makeDocumentRow(operation)),
      );
      ocr.collect
        .mockRejectedValueOnce(new RetryableError('did not complete in time'))
        .mockResolvedValueOnce(OCRED);

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );
      await service.process(MOCK_JOB_DATA);

      expect(ocr.start).toHaveBeenCalledTimes(1);
      expect(ocr.collect).toHaveBeenCalledTimes(2);
      expect(stored().ocrPages).toEqual([2]);
    });

    it('forgets an operation that failed or expired, with its pages, so the retry starts a new one', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan']));
      repo.findById.mockResolvedValue(
        makeDocumentRow({
          ocr_operation_id: 'ocr-operation-1',
          ocr_pages: [2],
        }),
      );
      ocr.collect.mockRejectedValue(
        new OcrOperationLostError('analysis ocr-operation-1 failed'),
      );

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );

      expect(repo.setOcrOperation).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        null,
        null,
      );
    });

    it('OCRs every page of a PDF whose text layer holds no text at all', async () => {
      upload(await pdfWith([[], []]));
      ocr.collect.mockResolvedValue({
        items: [
          { kind: 'text', text: 'Outlined text, page one.', page: 1 },
          { kind: 'text', text: 'Outlined text, page two.', page: 2 },
        ],
        pageCount: 2,
      });

      await service.process(MOCK_JOB_DATA);

      expect(repo.setOcrOperation).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'ocr-operation-1',
        [1, 2],
      );
      expect(stored().text).toBe(
        'Outlined text, page one.\nOutlined text, page two.',
      );
    });
  });

  describe('a file that is not a PDF', () => {
    it('is refused for good: the API issues upload URLs for PDFs only', async () => {
      const image = { ...MOCK_JOB_DATA, mimeType: 'image/png' };
      repo.findById.mockResolvedValue(
        makeDocumentRow({ mime_type: 'image/png' }),
      );

      await expect(service.process(image)).rejects.toThrow(PermanentError);
      expect(s3.getObjectBuffer).not.toHaveBeenCalled();
      expect(ocr.start).not.toHaveBeenCalled();
    });
  });

  describe('process — error paths', () => {
    it('fails an over-limit PDF for good, before reading it or calling OCR', async () => {
      upload(await pdfWith([PAGE_ONE, 'scan', PAGE_THREE]));

      await expect(withPageLimit(2).process(MOCK_JOB_DATA)).rejects.toThrow(
        /3 pages, exceeding the maximum of 2/,
      );
      expect(s3.putObject).not.toHaveBeenCalled();
      expect(ocr.start).not.toHaveBeenCalled();
      expect(repo.storeExtractedContent).not.toHaveBeenCalled();
    });

    it('fails a file that is not a readable PDF for good', async () => {
      s3.getObjectBuffer.mockResolvedValue(Buffer.from('not a pdf at all'));

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        PermanentError,
      );
      expect(ocr.start).not.toHaveBeenCalled();
    });

    it('retries when the file cannot be read from storage', async () => {
      s3.getObjectBuffer.mockRejectedValue(new Error('S3 timeout'));

      await expect(service.process(MOCK_JOB_DATA)).rejects.toThrow(
        RetryableError,
      );
    });

    it('fails a document with no text in its layer or from OCR', async () => {
      upload(await pdfWith(['scan']));
      ocr.collect.mockResolvedValue({ items: [], pageCount: 1 });

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
        expect(ocr.start).not.toHaveBeenCalled();
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
    it('fails the document and gives back the scan its upload used', async () => {
      repo.markFailed.mockResolvedValue(true);

      await service.markFailed('tenant-456', 'doc-123', 'Something went wrong');

      expect(repo.markFailed).toHaveBeenCalledWith(
        'tenant-456',
        'doc-123',
        'Something went wrong',
      );
      expect(producer.enqueue).toHaveBeenCalledWith(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.USAGE_REFUND,
        {
          tenantId: 'tenant-456',
          resourceId: 'doc-123',
          resourceType: 'document_scan',
          featureKey: 'document_scans',
          units: 1,
        },
        { jobId: 'usage-refund-scan-doc-123' },
      );
    });

    it('leaves a completed document (a duplicate job) alone, and refunds nothing', async () => {
      repo.markFailed.mockResolvedValue(false);

      await service.markFailed('tenant-456', 'doc-123', 'already completed');

      expect(producer.enqueue).not.toHaveBeenCalled();
    });

    it('should not throw when repository fails', async () => {
      repo.markFailed.mockRejectedValue(new Error('DB down'));

      await expect(
        service.markFailed('tenant-456', 'doc-123', 'error'),
      ).resolves.not.toThrow();
    });
  });
});

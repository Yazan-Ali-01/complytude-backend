import {
  copyPdfPages,
  countPdfPages,
  pagesWithImages,
  UnreadablePdfError,
} from '@lib/pdf';
import type { DocumentIngestionJobData } from '@lib/queue';
import {
  ENTITLEMENT_JOB_NAMES,
  PermanentError,
  QUEUE_NAMES,
  QueueProducerService,
  RetryableError,
} from '@lib/queue';
import { S3Service } from '@lib/storage';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3_PROMOTION_SERVICE,
  type IS3PromotionService,
} from '../interfaces/s3-promotion.interface';
import {
  OCR_SERVICE,
  type DocumentSection,
  type IOcrService,
  type OcrResult,
  OcrOperationLostError,
} from '../interfaces/ocr.interface';
import {
  DocumentWriteRepository,
  type DocumentRow,
} from '../repositories/document-write.repository';
import { sectionsFromLayout, type LayoutItem } from './document-layout';
import {
  layoutFromTextLayer,
  loadPdfJs,
  readTextLayer,
  UnreadableTextLayerError,
  type PageText,
} from './pdf-text-layer';

interface Extraction {
  text: string;
  sections: DocumentSection[];
  /** Pages (1-based) whose text came from OCR. */
  ocrPages: number[];
}

@Injectable()
export class DocumentIngestionService implements OnModuleInit {
  private readonly logger = new Logger(DocumentIngestionService.name);

  private readonly maxPages: number;
  private readonly minTextCharsPerPage: number;

  constructor(
    private readonly documentWriteRepository: DocumentWriteRepository,
    @Inject(OCR_SERVICE)
    private readonly ocrService: IOcrService,
    @Inject(S3_PROMOTION_SERVICE)
    private readonly s3PromotionService: IS3PromotionService,
    private readonly s3: S3Service,
    configService: ConfigService,
    private readonly queueProducer: QueueProducerService,
  ) {
    this.maxPages = configService.get<number>('ocr.maxPages', 50);
    this.minTextCharsPerPage = configService.get<number>(
      'ocr.minTextCharsPerPage',
      50,
    );
  }

  /** A pdf.js missing from the image fails the boot, not the first upload. */
  onModuleInit(): void {
    loadPdfJs();
  }

  async process(data: DocumentIngestionJobData): Promise<void> {
    const { documentId, tenantId } = data;

    this.logger.log(
      `Starting document ingestion: documentId=${documentId} tenantId=${tenantId}`,
    );

    // 1. Fetch document (in the payload's tenant) and validate status and payload
    const document = await this.fetchAndValidate(data);
    // The file to read and promote comes from the row, never from the payload
    const s3Bucket = document.s3_bucket!;
    const s3Key = document.s3_key!;

    // 2. Extract text (skip if content already stored — retry resilience)
    // content and content_structured are written atomically, so content being
    // non-null means the full extraction (including structure) already ran.
    const hasContentAlready =
      document.content !== null && document.content.trim().length > 0;

    let extractedText: string;

    if (hasContentAlready) {
      this.logger.log(
        `Content already stored for documentId=${documentId} — skipping extraction (retry path)`,
      );
      extractedText = document.content!;
    } else {
      const result = await this.extractText(tenantId, document);
      extractedText = result.text;

      // Persist text + structure atomically for retry resilience
      await this.storeContent(tenantId, documentId, result);
    }

    // 3. Promote file from quarantine → clean bucket
    const promotion = await this.promoteFile(documentId, s3Bucket, s3Key);

    // 4. Mark document as completed with new bucket/key
    await this.markCompleted(
      tenantId,
      documentId,
      promotion.bucket,
      promotion.key,
    );

    this.logger.log(
      `Document ingestion completed: documentId=${documentId} tenantId=${tenantId} ` +
        `textLength=${extractedText.length} promoted=${promotion.bucket}/${promotion.key}`,
    );
  }

  async markFailed(
    tenantId: string,
    documentId: string,
    error: string,
  ): Promise<void> {
    try {
      const failed = await this.documentWriteRepository.markFailed(
        tenantId,
        documentId,
        error,
      );
      if (!failed) {
        this.logger.warn(
          `Document ${documentId} not marked failed: it already completed`,
        );
        return;
      }
      this.logger.log(
        `Document marked as failed: documentId=${documentId} error="${error}"`,
      );
      await this.refundScan(tenantId, documentId);
    } catch (dbError: unknown) {
      this.logger.error(
        `Failed to mark document ${documentId} as failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
      );
    }
  }

  /**
   * The upload used one of the plan's scans when it was confirmed: a document that fails for good
   * gets it back (the API's USAGE_REFUND handler finds the usage by the document ID; none found,
   * e.g. for a job naming another tenant, is a no-op).
   */
  private async refundScan(
    tenantId: string,
    documentId: string,
  ): Promise<void> {
    await this.queueProducer
      .enqueue(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.USAGE_REFUND,
        {
          tenantId,
          resourceId: documentId,
          resourceType: 'document_scan',
          featureKey: 'document_scans',
          units: 1,
        },
        { jobId: `usage-refund-scan-${documentId}` },
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Could not enqueue the scan refund for document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async fetchAndValidate(
    data: DocumentIngestionJobData,
  ): Promise<DocumentRow> {
    const { documentId, tenantId } = data;
    const document = await this.documentWriteRepository
      .findById(tenantId, documentId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error fetching document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!document) {
      // Also what a payload naming another tenant's document gets: it isn't visible here
      throw new PermanentError(
        `Document ${documentId} not found in tenant ${tenantId} — skipping ingestion`,
      );
    }

    if (
      document.extraction_status === 'completed' ||
      document.extraction_status === 'failed'
    ) {
      throw new PermanentError(
        `Document ${documentId} already ${document.extraction_status} — skipping`,
      );
    }

    if (
      !document.s3_bucket ||
      !document.s3_key ||
      !document.mime_type ||
      document.s3_bucket !== data.s3Bucket ||
      document.s3_key !== data.s3Key ||
      document.mime_type !== data.mimeType
    ) {
      throw new PermanentError(
        `Ingestion job for document ${documentId} names a different file than the document — refusing`,
      );
    }

    return document;
  }

  /**
   * A PDF's own text layer is read here, and only its pages without one (scans) go to OCR, as a
   * PDF of just those pages; their text is merged back in page order. A born-digital PDF never
   * leaves the worker.
   */
  private async extractText(
    tenantId: string,
    document: DocumentRow,
  ): Promise<Extraction> {
    const documentId = document.id;
    const bucket = document.s3_bucket!;
    const key = document.s3_key!;

    // The API issues upload URLs for PDFs only
    if (document.mime_type !== 'application/pdf') {
      throw new PermanentError(
        `Document ${documentId} is ${document.mime_type}: only PDFs are read`,
      );
    }

    const pdf = await this.s3
      .getObjectBuffer(bucket, key)
      .catch((err: unknown) => {
        throw new RetryableError(
          `Could not read the file of document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });
    const textLayer = await this.readPdf(documentId, pdf);

    // A retry resumes the operation it started, over the same pages
    const allPages = textLayer.map((p) => p.page);
    let ocrPages =
      document.ocr_operation_id && document.ocr_pages
        ? document.ocr_pages
        : await this.pagesNeedingOcr(documentId, pdf, textLayer);

    let local = layoutFromTextLayer(
      textLayer.filter((p) => !ocrPages.includes(p.page)),
    );
    // No text in the layer at all (a scan without images we could see, text drawn as outlines):
    // the whole document is OCRed
    if (ocrPages.length === 0 && !sectionsFromLayout(local).text.trim()) {
      ocrPages = allPages;
      local = [];
    }
    if (ocrPages.length === 0) {
      this.logger.log(
        `Text layer read locally: documentId=${documentId} pages=${textLayer.length}, no OCR`,
      );
      return this.assemble(documentId, local, []);
    }

    const result = await this.ocr(tenantId, document, pdf, ocrPages);
    // OCR numbers the pages of the file it read: map them back to the document's
    const scanned = result.items.map((item) => ({
      ...item,
      page: ocrPages[item.page - 1] ?? item.page,
    }));

    this.logger.log(
      `Text layer read locally: documentId=${documentId} pages=${textLayer.length}, OCR pages=[${ocrPages.join(',')}]`,
    );
    // A stable sort: each page keeps its own reading order
    const items = [...local, ...scanned].sort((a, b) => a.page - b.page);
    return this.assemble(documentId, items, ocrPages);
  }

  /** The page cap (T-27) holds for every PDF, then its text layer. */
  private async readPdf(documentId: string, pdf: Buffer): Promise<PageText[]> {
    try {
      const pages = await countPdfPages(pdf);
      if (pages > this.maxPages) throw pageLimitExceeded(pages, this.maxPages);
      return await readTextLayer(pdf);
    } catch (error) {
      if (
        error instanceof UnreadablePdfError ||
        error instanceof UnreadableTextLayerError
      ) {
        throw new PermanentError(`Document ${documentId}: ${error.message}`);
      }
      throw error;
    }
  }

  /** Pages with too little text in their layer that draw an image: scans. */
  private async pagesNeedingOcr(
    documentId: string,
    pdf: Buffer,
    textLayer: PageText[],
  ): Promise<number[]> {
    const sparse = textLayer
      .filter((p) => p.usableChars < this.minTextCharsPerPage)
      .map((p) => p.page);
    if (sparse.length === 0) return [];
    return pagesWithImages(pdf, sparse).catch((err: unknown) => {
      throw new PermanentError(
        `Document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * OCR bills when an analysis starts, so each document starts at most one: its operation ID and
   * the pages it reads are stored before polling, and a retry (poll timeout, crash, stall)
   * resumes it. Only an operation that itself failed, or whose result is gone, is replaced.
   */
  private async ocr(
    tenantId: string,
    document: DocumentRow,
    pdf: Buffer,
    pages: number[],
  ): Promise<OcrResult> {
    const documentId = document.id;
    const toRetryable = (err: unknown): Error => {
      if (err instanceof PermanentError || err instanceof RetryableError) {
        return err;
      }
      return new RetryableError(
        `OCR failed for document ${documentId}`,
        err instanceof Error ? err : undefined,
      );
    };

    let operationId = document.ocr_operation_id;
    if (operationId) {
      this.logger.log(
        `Resuming OCR operation ${operationId} for documentId=${documentId} (retry)`,
      );
    } else {
      const file = await copyPdfPages(pdf, pages).catch((err: unknown) => {
        throw new PermanentError(
          `Document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      operationId = await this.ocrService.start(file).catch((err: unknown) => {
        throw toRetryable(err);
      });
      await this.documentWriteRepository
        .setOcrOperation(tenantId, documentId, operationId, pages)
        .catch((err: unknown) => {
          throw new RetryableError(
            `DB error storing OCR operation ${operationId} for document ${documentId}`,
            err instanceof Error ? err : undefined,
          );
        });
    }

    const result = await this.ocrService
      .collect(operationId)
      .catch(async (err: unknown) => {
        if (err instanceof OcrOperationLostError) {
          await this.documentWriteRepository.setOcrOperation(
            tenantId,
            documentId,
            null,
            null,
          );
        }
        throw toRetryable(err);
      });

    this.logger.log(
      `OCR complete: documentId=${documentId} ` +
        `blocks=${result.items.length} pages=${result.pageCount} confidence=${result.confidence ?? 'unknown'}`,
    );
    return result;
  }

  private assemble(
    documentId: string,
    items: LayoutItem[],
    ocrPages: number[],
  ): Extraction {
    const { text, sections } = sectionsFromLayout(items);
    if (!text.trim()) {
      throw new PermanentError(
        `Document ${documentId} has no text: nothing in its text layer, and OCR found none`,
      );
    }
    return { text, sections, ocrPages };
  }

  private async storeContent(
    tenantId: string,
    documentId: string,
    { text, sections, ocrPages }: Extraction,
  ): Promise<void> {
    await this.documentWriteRepository
      .storeExtractedContent(tenantId, documentId, text, sections, ocrPages)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error storing content for document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Extracted text stored: documentId=${documentId} length=${text.length} sections=${sections.length} ocrPages=${ocrPages.length}`,
    );
  }

  private async promoteFile(
    documentId: string,
    sourceBucket: string,
    sourceKey: string,
  ) {
    const result = await this.s3PromotionService
      .promote(sourceBucket, sourceKey)
      .catch((err: unknown) => {
        if (err instanceof PermanentError) throw err;
        throw new RetryableError(
          `S3 promotion failed for document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `File promoted: documentId=${documentId} from=${sourceBucket}/${sourceKey} to=${result.bucket}/${result.key}`,
    );

    return result;
  }

  private async markCompleted(
    tenantId: string,
    documentId: string,
    newBucket: string,
    newKey: string,
  ): Promise<void> {
    await this.documentWriteRepository
      .markCompleted(tenantId, documentId, newBucket, newKey)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error marking document ${documentId} as completed`,
          err instanceof Error ? err : undefined,
        );
      });
  }
}

/** DOCUMENT_MAX_PAGES caps every PDF, read locally or by OCR. */
function pageLimitExceeded(pages: number, maxPages: number): PermanentError {
  return new PermanentError(
    `Document has ${pages} pages, exceeding the maximum of ${maxPages}. ` +
      `Increase DOCUMENT_MAX_PAGES if this is expected.`,
  );
}

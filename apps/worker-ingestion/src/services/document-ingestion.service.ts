import {
  copyPdfPages,
  countPdfPages,
  pagesWithImages,
  UnreadablePdfError,
} from '@lib/pdf';
import type { DocumentIngestionJobData } from '@lib/queue';
import { PermanentError, RetryableError } from '@lib/queue';
import { S3Service } from '@lib/storage';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3_PROMOTION_SERVICE,
  type IS3PromotionService,
} from '../interfaces/s3-promotion.interface';
import {
  TEXTRACT_SERVICE,
  type DocumentSection,
  type ITextractService,
  type TextractResult,
  TextractJobFailedError,
} from '../interfaces/textract.interface';
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
import { pageLimitExceeded } from './textract.service';

/**
 * Where the PDF of a document's scanned pages waits for Textract, in the quarantine bucket. The
 * ingestion role may write only under this prefix there (infra/modules/ecs/iam.tf).
 */
export const OCR_PAGES_PREFIX = 'ocr-pages/';

interface Extraction {
  text: string;
  sections: DocumentSection[];
  /** Pages (1-based) whose text came from OCR. */
  ocrPages: number[];
}

/** What a Textract job reads: the uploaded file, or a PDF of some of its pages. */
interface OcrTarget {
  bucket: string;
  key: string;
  mimeType: string;
  /** The document's pages in the file, in order; null when it is the uploaded file itself. */
  pages: number[] | null;
}

@Injectable()
export class DocumentIngestionService implements OnModuleInit {
  private readonly logger = new Logger(DocumentIngestionService.name);

  private readonly maxPages: number;
  private readonly minTextCharsPerPage: number;

  constructor(
    private readonly documentWriteRepository: DocumentWriteRepository,
    @Inject(TEXTRACT_SERVICE)
    private readonly textractService: ITextractService,
    @Inject(S3_PROMOTION_SERVICE)
    private readonly s3PromotionService: IS3PromotionService,
    private readonly s3: S3Service,
    configService: ConfigService,
  ) {
    this.maxPages = configService.get<number>('textract.maxPages', 50);
    this.minTextCharsPerPage = configService.get<number>(
      'textract.minTextCharsPerPage',
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
      await this.documentWriteRepository.markFailed(
        tenantId,
        documentId,
        error,
      );
      this.logger.log(
        `Document marked as failed: documentId=${documentId} error="${error}"`,
      );
    } catch (dbError: unknown) {
      this.logger.error(
        `Failed to mark document ${documentId} as failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
      );
    }
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
   * A PDF's own text layer is read here, and only its pages without one (scans) go to Textract,
   * as a PDF of just those pages; their text is merged back in page order. A born-digital PDF
   * never leaves the worker. An image upload has no text layer and goes to Textract whole.
   */
  private async extractText(
    tenantId: string,
    document: DocumentRow,
  ): Promise<Extraction> {
    const documentId = document.id;
    const bucket = document.s3_bucket!;
    const key = document.s3_key!;
    const mimeType = document.mime_type!;

    if (mimeType !== 'application/pdf') {
      const result = await this.ocr(tenantId, document, {
        bucket,
        key,
        mimeType,
        pages: null,
      });
      const pages = Array.from({ length: result.pageCount }, (_, i) => i + 1);
      return this.assemble(documentId, result.items, pages);
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

    // A retry resumes the job it started, over the same pages. A job stored without pages
    // predates local reading and covered the whole file.
    const allPages = textLayer.map((p) => p.page);
    let ocrPages = document.textract_job_id
      ? (document.ocr_pages ?? allPages)
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

    const target: OcrTarget =
      document.textract_job_id && document.ocr_pages === null
        ? { bucket, key, mimeType, pages: null }
        : {
            bucket,
            key: `${OCR_PAGES_PREFIX}${tenantId}/${documentId}.pdf`,
            mimeType,
            pages: ocrPages,
          };
    const result = await this.ocr(tenantId, document, target, () =>
      copyPdfPages(pdf, ocrPages),
    );
    // Textract numbers the pages of the file it read: map them back to the document's
    const pageMap = target.pages;
    const scanned = result.items.map((item) => ({
      ...item,
      page: pageMap ? (pageMap[item.page - 1] ?? item.page) : item.page,
    }));
    if (pageMap) await this.removeOcrCopy(documentId, target);

    this.logger.log(
      `Text layer read locally: documentId=${documentId} pages=${textLayer.length}, OCR pages=[${ocrPages.join(',')}]`,
    );
    // A stable sort: each page keeps its own reading order
    const items = [...local, ...scanned].sort((a, b) => a.page - b.page);
    return this.assemble(documentId, items, ocrPages);
  }

  /** The page cap (Textract's, T-27) holds for every PDF, then its text layer. */
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
   * Textract bills when a job starts, so each document starts at most one job: its ID and the
   * pages it reads are stored before polling, and a retry (poll timeout, crash, stall) resumes
   * it. Only a job that itself failed is replaced.
   */
  private async ocr(
    tenantId: string,
    document: DocumentRow,
    target: OcrTarget,
    pagesFile?: () => Promise<Uint8Array>,
  ): Promise<TextractResult> {
    const documentId = document.id;
    const toRetryable = (err: unknown): Error => {
      if (err instanceof PermanentError || err instanceof RetryableError) {
        return err;
      }
      return new RetryableError(
        `Textract extraction failed for document ${documentId}`,
        err instanceof Error ? err : undefined,
      );
    };

    let jobId = document.textract_job_id;
    if (jobId) {
      this.logger.log(
        `Resuming Textract job ${jobId} for documentId=${documentId} (retry)`,
      );
    } else {
      if (target.pages && pagesFile) {
        const file = await pagesFile().catch((err: unknown) => {
          throw new PermanentError(
            `Document ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
        await this.s3
          .putObject(
            target.bucket,
            target.key,
            Buffer.from(file),
            'application/pdf',
          )
          .catch((err: unknown) => {
            throw new RetryableError(
              `Could not store the scanned pages of document ${documentId} for OCR`,
              err instanceof Error ? err : undefined,
            );
          });
      }
      jobId = await this.textractService
        .startAnalysis(target.bucket, target.key, target.mimeType)
        .catch((err: unknown) => {
          throw toRetryable(err);
        });
      await this.documentWriteRepository
        .setTextractJob(tenantId, documentId, jobId, target.pages)
        .catch((err: unknown) => {
          throw new RetryableError(
            `DB error storing Textract job ${jobId} for document ${documentId}`,
            err instanceof Error ? err : undefined,
          );
        });
    }

    const result = await this.textractService
      .collectResult(jobId)
      .catch(async (err: unknown) => {
        if (err instanceof TextractJobFailedError) {
          await this.documentWriteRepository.setTextractJob(
            tenantId,
            documentId,
            null,
            null,
          );
        }
        throw toRetryable(err);
      });

    this.logger.log(
      `Textract extraction complete: documentId=${documentId} ` +
        `blocks=${result.items.length} pages=${result.pageCount} confidence=${result.confidence ?? 'unknown'}`,
    );
    return result;
  }

  /** The OCR copy has served its purpose; the bucket's lifecycle rule removes any left behind. */
  private async removeOcrCopy(
    documentId: string,
    target: OcrTarget,
  ): Promise<void> {
    await this.s3
      .deleteObject(target.bucket, target.key)
      .catch((err: unknown) => {
        this.logger.warn(
          `Could not delete the OCR copy of document ${documentId} (${target.key}); it expires with the quarantine bucket's lifecycle: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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

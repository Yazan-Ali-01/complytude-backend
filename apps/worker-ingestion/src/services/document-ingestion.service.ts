import type { DocumentIngestionJobData } from '@lib/queue';
import { PermanentError, RetryableError } from '@lib/queue';
import { Inject, Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);

  constructor(
    private readonly documentWriteRepository: DocumentWriteRepository,
    @Inject(TEXTRACT_SERVICE)
    private readonly textractService: ITextractService,
    @Inject(S3_PROMOTION_SERVICE)
    private readonly s3PromotionService: IS3PromotionService,
  ) {}

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
    const mimeType = document.mime_type!;

    // 2. Extract text (skip if content already stored — retry resilience)
    // content and content_structured are written atomically, so content being
    // non-null means the full extraction (including structure) already ran.
    const hasContentAlready =
      document.content !== null && document.content.trim().length > 0;

    let extractedText: string;

    if (hasContentAlready) {
      this.logger.log(
        `Content already stored for documentId=${documentId} — skipping Textract (retry path)`,
      );
      extractedText = document.content!;
    } else {
      const result = await this.extractText(
        tenantId,
        documentId,
        document.textract_job_id,
        s3Bucket,
        s3Key,
        mimeType,
      );
      extractedText = result.text;

      // Persist text + structure atomically for retry resilience
      await this.storeContent(
        tenantId,
        documentId,
        result.text,
        result.sections,
      );
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
   * Textract bills when a job starts, so each document starts at most one job: its ID is stored
   * before polling and a retry (poll timeout, crash, stall) resumes it. Only a job that itself
   * failed is replaced.
   */
  private async extractText(
    tenantId: string,
    documentId: string,
    storedJobId: string | null,
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<TextractResult> {
    const toRetryable = (err: unknown): Error => {
      if (err instanceof PermanentError || err instanceof RetryableError) {
        return err;
      }
      return new RetryableError(
        `Textract extraction failed for document ${documentId}`,
        err instanceof Error ? err : undefined,
      );
    };

    let jobId = storedJobId;
    if (jobId) {
      this.logger.log(
        `Resuming Textract job ${jobId} for documentId=${documentId} (retry)`,
      );
    } else {
      jobId = await this.textractService
        .startAnalysis(bucket, key, mimeType)
        .catch((err: unknown) => {
          throw toRetryable(err);
        });
      await this.documentWriteRepository
        .setTextractJobId(tenantId, documentId, jobId)
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
          await this.documentWriteRepository.setTextractJobId(
            tenantId,
            documentId,
            null,
          );
        }
        throw toRetryable(err);
      });

    if (!result.text || result.text.trim().length === 0) {
      throw new PermanentError(
        `Textract returned no text for document ${documentId} — file may be a scanned image without OCR content`,
      );
    }

    this.logger.log(
      `Textract extraction complete: documentId=${documentId} ` +
        `textLength=${result.text.length} sections=${result.sections.length} pages=${result.pageCount ?? 'unknown'}`,
    );

    return result;
  }

  private async storeContent(
    tenantId: string,
    documentId: string,
    content: string,
    sections: DocumentSection[],
  ): Promise<void> {
    await this.documentWriteRepository
      .storeExtractedContent(tenantId, documentId, content, sections)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error storing content for document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Extracted text stored: documentId=${documentId} length=${content.length} sections=${sections.length}`,
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

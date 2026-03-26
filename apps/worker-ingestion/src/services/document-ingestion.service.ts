import type { DocumentIngestionJobData } from '@lib/queue';
import { PermanentError, RetryableError } from '@lib/queue';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  S3_PROMOTION_SERVICE,
  type IS3PromotionService,
} from '../interfaces/s3-promotion.interface';
import {
  TEXTRACT_SERVICE,
  type ITextractService,
} from '../interfaces/textract.interface';
import { DocumentWriteRepository } from '../repositories/document-write.repository';

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
    const { documentId, tenantId, s3Key, s3Bucket, mimeType } = data;

    this.logger.log(
      `Starting document ingestion: documentId=${documentId} tenantId=${tenantId}`,
    );

    // 1. Fetch document and validate status
    const document = await this.fetchAndValidate(documentId);

    // 2. Extract text (skip if content already stored — retry resilience)
    const hasContentAlready =
      document.content !== null && document.content.trim().length > 0;

    let extractedText: string;

    if (hasContentAlready) {
      this.logger.log(
        `Content already stored for documentId=${documentId} — skipping Textract (retry path)`,
      );
      extractedText = document.content!;
    } else {
      extractedText = await this.extractText(
        documentId,
        s3Bucket,
        s3Key,
        mimeType,
      );

      // Persist extracted text immediately for retry resilience
      await this.storeContent(documentId, extractedText);
    }

    // 3. Promote file from quarantine → clean bucket
    const promotion = await this.promoteFile(documentId, s3Bucket, s3Key);

    // 4. Mark document as completed with new bucket/key
    await this.markCompleted(documentId, promotion.bucket, promotion.key);

    this.logger.log(
      `Document ingestion completed: documentId=${documentId} tenantId=${tenantId} ` +
        `textLength=${extractedText.length} promoted=${promotion.bucket}/${promotion.key}`,
    );
  }

  async markFailed(documentId: string, error: string): Promise<void> {
    try {
      await this.documentWriteRepository.markFailed(documentId, error);
      this.logger.log(
        `Document marked as failed: documentId=${documentId} error="${error}"`,
      );
    } catch (dbError: unknown) {
      this.logger.error(
        `Failed to mark document ${documentId} as failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
      );
    }
  }

  private async fetchAndValidate(documentId: string) {
    const document = await this.documentWriteRepository
      .findById(documentId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error fetching document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!document) {
      throw new PermanentError(
        `Document ${documentId} not found — skipping ingestion`,
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

    return document;
  }

  private async extractText(
    documentId: string,
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<string> {
    const result = await this.textractService
      .extractText(bucket, key, mimeType)
      .catch((err: unknown) => {
        if (err instanceof PermanentError) throw err;
        throw new RetryableError(
          `Textract extraction failed for document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!result.text || result.text.trim().length === 0) {
      throw new PermanentError(
        `Textract returned no text for document ${documentId} — file may be a scanned image without OCR content`,
      );
    }

    this.logger.log(
      `Textract extraction complete: documentId=${documentId} ` +
        `textLength=${result.text.length} pages=${result.pageCount ?? 'unknown'}`,
    );

    return result.text;
  }

  private async storeContent(
    documentId: string,
    content: string,
  ): Promise<void> {
    await this.documentWriteRepository
      .storeExtractedContent(documentId, content)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error storing content for document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Extracted text stored: documentId=${documentId} length=${content.length}`,
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
    documentId: string,
    newBucket: string,
    newKey: string,
  ): Promise<void> {
    await this.documentWriteRepository
      .markCompleted(documentId, newBucket, newKey)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error marking document ${documentId} as completed`,
          err instanceof Error ? err : undefined,
        );
      });
  }
}

import { DatabaseService } from '@lib/database';
import type { ExtractionStatus } from '@lib/queue';
import { Injectable } from '@nestjs/common';
import type { DocumentSection } from '../interfaces/ocr.interface';

export interface DocumentRow {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  content_structured: DocumentSection[] | null;
  source_type: string;
  s3_key: string | null;
  s3_bucket: string | null;
  original_filename: string | null;
  mime_type: string | null;
  extraction_status: ExtractionStatus | null;
  extraction_error: string | null;
  extracted_at: Date | null;
  ocr_operation_id: string | null;
  /** Pages sent to OCR: set with the OCR operation, final with the content. */
  ocr_pages: number[] | null;
}

/**
 * documents has RLS with FORCE ROW LEVEL SECURITY. Every query runs in the job's tenant context
 * (from the payload), so a document of any other tenant is neither seen nor changed.
 */
@Injectable()
export class DocumentWriteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findById(
    tenantId: string,
    documentId: string,
  ): Promise<DocumentRow | null> {
    const result = await this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        return client.query<DocumentRow>(
          `SELECT id, tenant_id, title, content, content_structured, source_type,
                  s3_key, s3_bucket, original_filename, mime_type,
                  extraction_status, extraction_error, extracted_at, ocr_operation_id,
                  ocr_pages
           FROM public.documents
           WHERE id = $1 AND deleted_at IS NULL`,
          [documentId],
        );
      },
    );
    return result.rows[0] ?? null;
  }

  /**
   * The OCR operation to resume on a retry, with the pages it reads; both null once a failed or
   * expired operation must be replaced.
   */
  async setOcrOperation(
    tenantId: string,
    documentId: string,
    operationId: string | null,
    ocrPages: number[] | null,
  ): Promise<void> {
    await this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        await client.query(
          `UPDATE public.documents
           SET ocr_operation_id = $1, ocr_pages = $2, updated_at = NOW()
           WHERE id = $3`,
          [operationId, ocrPages, documentId],
        );
      },
    );
  }

  async storeExtractedContent(
    tenantId: string,
    documentId: string,
    content: string,
    sections: DocumentSection[],
    ocrPages: number[],
  ): Promise<void> {
    await this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        await client.query(
          `UPDATE public.documents
           SET content = $1, content_structured = $2::jsonb, ocr_pages = $3, updated_at = NOW()
           WHERE id = $4`,
          [content, JSON.stringify(sections), ocrPages, documentId],
        );
      },
    );
  }

  async markCompleted(
    tenantId: string,
    documentId: string,
    newBucket: string,
    newKey: string,
  ): Promise<void> {
    await this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        await client.query(
          `UPDATE public.documents
           SET extraction_status = 'completed',
               s3_bucket = $1,
               s3_key = $2,
               extracted_at = NOW(),
               extraction_error = NULL,
               updated_at = NOW()
           WHERE id = $3`,
          [newBucket, newKey, documentId],
        );
      },
    );
  }

  /**
   * Marks the extraction failed, unless it already completed (a duplicate job for a finished
   * document must not undo it). Returns whether this call failed the document.
   */
  async markFailed(
    tenantId: string,
    documentId: string,
    error: string,
  ): Promise<boolean> {
    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        const result = await client.query(
          `UPDATE public.documents
           SET extraction_status = 'failed',
               extraction_error = $1,
               updated_at = NOW()
           WHERE id = $2 AND extraction_status IS DISTINCT FROM 'completed'`,
          [error, documentId],
        );
        return (result.rowCount ?? 0) > 0;
      },
    );
  }
}

import { DatabaseService } from '@lib/database';
import type { ExtractionStatus } from '@lib/queue';
import { Injectable } from '@nestjs/common';
import type { DocumentSection } from '../interfaces/textract.interface';

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
}

@Injectable()
export class DocumentWriteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findById(documentId: string): Promise<DocumentRow | null> {
    const result =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          return client.query<DocumentRow>(
            `SELECT id, tenant_id, title, content, content_structured, source_type,
                  s3_key, s3_bucket, original_filename, mime_type,
                  extraction_status, extraction_error, extracted_at
           FROM public.documents
           WHERE id = $1`,
            [documentId],
          );
        },
      );
    return result.rows[0] ?? null;
  }

  async storeExtractedContent(
    documentId: string,
    content: string,
    sections: DocumentSection[],
  ): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await client.query(
          `UPDATE public.documents
           SET content = $1, content_structured = $2::jsonb, updated_at = NOW()
           WHERE id = $3`,
          [content, JSON.stringify(sections), documentId],
        );
      },
    );
  }

  async markCompleted(
    documentId: string,
    newBucket: string,
    newKey: string,
  ): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
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

  async markFailed(documentId: string, error: string): Promise<void> {
    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await client.query(
          `UPDATE public.documents
           SET extraction_status = 'failed',
               extraction_error = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [error, documentId],
        );
      },
    );
  }
}

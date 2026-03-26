import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import type { DocumentSourceType, ExtractionStatus } from '@lib/queue';
import { Injectable } from '@nestjs/common';

export type { DocumentSourceType, ExtractionStatus };

export interface Document {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  metadata: Record<string, unknown>;
  template_id: string | null;
  template_version_id: string | null;
  generation_metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  source_type: DocumentSourceType;
  s3_key: string | null;
  s3_bucket: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  extraction_status: ExtractionStatus | null;
  extraction_error: string | null;
  extracted_at: Date | null;
}

export type CreateDocumentRow = {
  tenant_id: string;
  title: string;
  content?: string | null;
  metadata?: string;
  template_id?: string | null;
  template_version_id?: string | null;
  generation_metadata?: string | null;
  created_by?: string | null;
  source_type?: DocumentSourceType;
  s3_key?: string | null;
  s3_bucket?: string | null;
  original_filename?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  extraction_status?: ExtractionStatus | null;
};

export type UpdateDocumentRow = {
  title?: string;
  content?: string | null;
  metadata?: string;
  template_id?: string | null;
  template_version_id?: string | null;
  generation_metadata?: string | null;
  s3_key?: string | null;
  s3_bucket?: string | null;
  extraction_status?: ExtractionStatus | null;
  extraction_error?: string | null;
  extracted_at?: Date | null;
};

type DocumentRow = {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  metadata: string | Record<string, unknown>;
  template_id: string | null;
  template_version_id: string | null;
  generation_metadata: string | Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  source_type: DocumentSourceType;
  s3_key: string | null;
  s3_bucket: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  extraction_status: ExtractionStatus | null;
  extraction_error: string | null;
  extracted_at: Date | null;
};

@Injectable()
export class DocumentRepository extends BaseRepository<
  Document,
  CreateDocumentRow,
  UpdateDocumentRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.documents');
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, title, content, metadata, template_id, template_version_id, generation_metadata, created_by, created_at, updated_at, source_type, s3_key, s3_bucket, original_filename, file_size_bytes, mime_type, extraction_status, extraction_error, extracted_at';
  }

  protected mapRow(row: Record<string, unknown>): Document {
    const data = row as DocumentRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      title: data.title,
      content: data.content,
      metadata:
        typeof data.metadata === 'string'
          ? (JSON.parse(data.metadata) as Record<string, unknown>)
          : data.metadata,
      template_id: data.template_id,
      template_version_id: data.template_version_id,
      generation_metadata:
        data.generation_metadata === null
          ? null
          : typeof data.generation_metadata === 'string'
            ? (JSON.parse(data.generation_metadata) as Record<string, unknown>)
            : data.generation_metadata,
      created_by: data.created_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
      source_type: data.source_type,
      s3_key: data.s3_key,
      s3_bucket: data.s3_bucket,
      original_filename: data.original_filename,
      file_size_bytes: data.file_size_bytes,
      mime_type: data.mime_type,
      extraction_status: data.extraction_status,
      extraction_error: data.extraction_error,
      extracted_at: data.extracted_at,
    };
  }

  /**
   * Atomically claims a pending file-upload document for ingestion.
   * Returns the document if the row was updated, null if no matching row
   * (already confirmed, wrong source_type, wrong tenant via RLS, etc.).
   */
  async claimPendingUpload(
    documentId: string,
    options?: QueryOptions,
  ): Promise<Document | null> {
    const columns = this.getSelectColumns();
    const result = await this.executeQuery(
      `UPDATE public.documents
       SET extraction_status = 'processing', updated_at = NOW()
       WHERE id = $1
         AND source_type = 'file_upload'
         AND extraction_status = 'pending'
       RETURNING ${columns}`,
      [documentId],
      options,
    );
    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async findAllByTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<Document[]> {
    const columns = this.getSelectColumns();
    const result = await this.executeQuery(
      `SELECT ${columns} FROM public.documents WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
      options,
    );
    return result.rows.map((row) =>
      this.mapRow(row as Record<string, unknown>),
    );
  }
}

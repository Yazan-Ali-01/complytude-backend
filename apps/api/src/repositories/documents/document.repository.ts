import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import type { DocumentSourceType, ExtractionStatus } from '@lib/queue';
import { Injectable } from '@nestjs/common';

export type { DocumentSourceType, ExtractionStatus };

export interface Document {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  metadata: Record<string, unknown>;
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
  deleted_at: Date | null;
  deleted_by: string | null;
}

type BaseCreateDocumentRow = {
  tenant_id: string;
  title: string;
  metadata?: string;
  created_by?: string | null;
};

type CreateTextInputRow = BaseCreateDocumentRow & {
  source_type: 'text_input';
  content: string;
};

type CreateFileUploadRow = BaseCreateDocumentRow & {
  source_type: 'file_upload';
  s3_key: string;
  s3_bucket: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  extraction_status: ExtractionStatus;
};

export type CreateDocumentRow = CreateTextInputRow | CreateFileUploadRow;

export type UpdateDocumentRow = {
  title?: string;
  content?: string | null;
  metadata?: string;
  s3_key?: string | null;
  s3_bucket?: string | null;
  extraction_status?: ExtractionStatus | null;
  extraction_error?: string | null;
  extracted_at?: Date | null;
};

export interface DocumentFilters {
  search?: string;
  sourceType?: DocumentSourceType;
  extractionStatus?: ExtractionStatus;
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  title: 'title',
  updatedAt: 'updated_at',
};

type DocumentRow = {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  metadata: string | Record<string, unknown>;
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
  deleted_at: Date | null;
  deleted_by: string | null;
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
    return 'id, tenant_id, title, content, metadata, created_by, created_at, updated_at, source_type, s3_key, s3_bucket, original_filename, file_size_bytes, mime_type, extraction_status, extraction_error, extracted_at, deleted_at, deleted_by';
  }

  private getListSelectColumns(): string {
    return 'id, tenant_id, title, metadata, created_by, created_at, updated_at, source_type, s3_key, s3_bucket, original_filename, file_size_bytes, mime_type, extraction_status, extraction_error, extracted_at, deleted_at, deleted_by';
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
      deleted_at: data.deleted_at ?? null,
      deleted_by: data.deleted_by ?? null,
    };
  }

  async findActiveById(
    id: string,
    options?: QueryOptions,
  ): Promise<Document | null> {
    const result = await this.executeQuery<DocumentRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`,
      [id],
      options,
    );
    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async softDelete(
    id: string,
    deletedBy: string,
    options?: QueryOptions,
  ): Promise<Document> {
    const result = await this.executeQuery<DocumentRow>(
      `UPDATE ${this.tableName} SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING ${this.getSelectColumns()}`,
      [id, deletedBy],
      options,
    );
    if (result.rows.length === 0) {
      throw new Error(`Document ${id} not found or already deleted`);
    }
    return this.mapRow(result.rows[0] as Record<string, unknown>);
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

  async findMany(
    filters: DocumentFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
    options?: QueryOptions,
  ): Promise<OffsetPaginationResult<Document>> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`title ILIKE $${params.length}`);
    }
    if (filters.sourceType) {
      params.push(filters.sourceType);
      conditions.push(`source_type = $${params.length}`);
    }
    if (filters.extractionStatus) {
      params.push(filters.extractionStatus);
      conditions.push(`extraction_status = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      params,
      options,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const sortColumn =
      ALLOWED_SORT_COLUMNS[pagination.sortBy ?? ''] ?? 'created_at';
    const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    params.push(pagination.limit, offset);
    const dataResult = await this.executeQuery<DocumentRow>(
      `SELECT ${this.getListSelectColumns()} FROM ${this.tableName} ${whereClause} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
      options,
    );

    const totalPages = Math.ceil(total / pagination.limit);

    return {
      data: dataResult.rows.map((row) =>
        this.mapRow(row as Record<string, unknown>),
      ),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    };
  }

  async findAllByTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<Document[]> {
    const columns = this.getSelectColumns();
    const result = await this.executeQuery(
      `SELECT ${columns} FROM public.documents WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [tenantId],
      options,
    );
    return result.rows.map((row) =>
      this.mapRow(row as Record<string, unknown>),
    );
  }
}

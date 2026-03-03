import { BaseRepository, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

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
}

export type CreateDocumentRow = {
  tenant_id: string;
  title: string;
  content?: string | null;
  metadata?: string; // Stringified JSONB
  template_id?: string | null;
  template_version_id?: string | null;
  generation_metadata?: string | null; // Stringified JSONB
  created_by?: string | null;
};

export type UpdateDocumentRow = {
  title?: string;
  content?: string | null;
  metadata?: string; // Stringified JSONB
  template_id?: string | null;
  template_version_id?: string | null;
  generation_metadata?: string | null; // Stringified JSONB
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
    return 'id, tenant_id, title, content, metadata, template_id, template_version_id, generation_metadata, created_by, created_at, updated_at';
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
    };
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

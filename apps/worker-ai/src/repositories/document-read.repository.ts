import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface DocumentSection {
  heading: string | null;
  level: number;
  content: string;
  pageStart: number;
}

export interface DocumentContent {
  id: string;
  title: string;
  content: string;
  content_structured: DocumentSection[] | null;
  tenant_id: string;
  /** Pages whose text came from OCR at ingestion; null for pasted text or before migration 034. */
  ocr_pages: number[] | null;
}

/**
 * documents has RLS with FORCE ROW LEVEL SECURITY. Reads run in the job's tenant context, so a
 * document of any other tenant is simply not found.
 */
@Injectable()
export class DocumentReadRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findContentById(
    tenantId: string,
    id: string,
  ): Promise<DocumentContent | null> {
    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      async (client) => {
        const result = await client.query<DocumentContent>(
          `SELECT id, title, content, content_structured, tenant_id, ocr_pages
           FROM public.documents WHERE id = $1 AND deleted_at IS NULL`,
          [id],
        );
        return result.rows[0] ?? null;
      },
    );
  }
}

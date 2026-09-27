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
}

/**
 * documents has RLS with FORCE ROW LEVEL SECURITY.
 * Worker-ai has no tenant context, so all queries must use
 * transactionWithPlatformAdminContext to satisfy the is_platform_admin() policy.
 */
@Injectable()
export class DocumentReadRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findContentById(id: string): Promise<DocumentContent | null> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const result = await client.query<DocumentContent>(
          `SELECT id, title, content, content_structured, tenant_id
           FROM public.documents WHERE id = $1`,
          [id],
        );
        return result.rows[0] ?? null;
      },
    );
  }
}

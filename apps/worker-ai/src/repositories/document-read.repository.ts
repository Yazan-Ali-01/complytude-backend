import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface DocumentContent {
  id: string;
  title: string;
  content: string;
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
          `SELECT id, title, content, tenant_id FROM public.documents WHERE id = $1`,
          [id],
        );
        return result.rows[0] ?? null;
      },
    );
  }
}

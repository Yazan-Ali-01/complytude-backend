import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface DocumentContent {
  id: string;
  title: string;
  content: string;
  tenant_id: string;
}

@Injectable()
export class DocumentReadRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findContentById(id: string): Promise<DocumentContent | null> {
    const result = await this.databaseService.query<DocumentContent>(
      `SELECT id, title, content, tenant_id FROM public.documents WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}

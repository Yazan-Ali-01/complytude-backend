import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface RulesetChunkInsertRow {
  rulesetId: string;
  rulesetVersionId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

// 6 params per row — keep well under PostgreSQL's 65,535 bind-parameter limit
const PARAMS_PER_ROW = 6;
const INSERT_PAGE_SIZE = Math.floor(60_000 / PARAMS_PER_ROW); // 10,000 rows

@Injectable()
export class RulesetChunksRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async deleteByVersionId(
    versionId: string,
    client?: PoolClient,
  ): Promise<number> {
    const query = `DELETE FROM public.ruleset_chunks WHERE ruleset_version_id = $1`;
    const result = client
      ? await client.query(query, [versionId])
      : await this.databaseService.query(query, [versionId], true);

    return result.rowCount ?? 0;
  }

  async insertBatch(
    chunks: RulesetChunkInsertRow[],
    client?: PoolClient,
    pageSize?: number,
  ): Promise<void> {
    if (chunks.length === 0) return;

    const effectivePageSize = Math.min(
      pageSize ?? INSERT_PAGE_SIZE,
      INSERT_PAGE_SIZE,
    );

    for (let i = 0; i < chunks.length; i += effectivePageSize) {
      await this.insertPage(chunks.slice(i, i + effectivePageSize), client);
    }
  }

  private async insertPage(
    chunks: RulesetChunkInsertRow[],
    client?: PoolClient,
  ): Promise<void> {
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const chunk of chunks) {
      valuePlaceholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::vector, $${paramIndex++})`,
      );
      params.push(
        chunk.rulesetId,
        chunk.rulesetVersionId,
        chunk.chunkIndex,
        chunk.content,
        `[${chunk.embedding.join(',')}]`,
        JSON.stringify(chunk.metadata),
      );
    }

    const query = `
      INSERT INTO public.ruleset_chunks
        (ruleset_id, ruleset_version_id, chunk_index, content, embedding, metadata)
      VALUES ${valuePlaceholders.join(', ')}
    `;

    if (client) {
      await client.query(query, params);
    } else {
      await this.databaseService.query(query, params, true);
    }
  }
}

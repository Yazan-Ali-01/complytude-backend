import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface RulesetChunkInsertRow {
  rulesetId: string;
  rulesetVersionId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  /** The model that produced `embedding`; retrieval compares only vectors of the same model. */
  embeddingModel: string;
  metadata: Record<string, unknown>;
}

// 7 params per row — keep well under PostgreSQL's 65,535 bind-parameter limit
const PARAMS_PER_ROW = 7;
const INSERT_PAGE_SIZE = Math.floor(60_000 / PARAMS_PER_ROW); // 8,571 rows

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
      : await this.databaseService.query(query, [versionId]);

    return result.rowCount ?? 0;
  }

  /**
   * Removes the chunks of a ruleset's inactive (superseded) versions other than `keepVersionId`,
   * the version just ingested: it may be waiting for its activation.
   */
  async deleteInactiveVersionChunks(
    rulesetId: string,
    keepVersionId: string,
    client: PoolClient,
  ): Promise<number> {
    const result = await client.query(
      `DELETE FROM public.ruleset_chunks c
       USING public.ruleset_versions v
       WHERE c.ruleset_version_id = v.id AND c.ruleset_id = $1 AND NOT v.is_active
         AND v.id <> $2`,
      [rulesetId, keepVersionId],
    );
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
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::vector, $${paramIndex++}, $${paramIndex++})`,
      );
      params.push(
        chunk.rulesetId,
        chunk.rulesetVersionId,
        chunk.chunkIndex,
        chunk.content,
        `[${chunk.embedding.join(',')}]`,
        chunk.embeddingModel,
        JSON.stringify(chunk.metadata),
      );
    }

    const query = `
      INSERT INTO public.ruleset_chunks
        (ruleset_id, ruleset_version_id, chunk_index, content, embedding, embedding_model, metadata)
      VALUES ${valuePlaceholders.join(', ')}
    `;

    if (client) {
      await client.query(query, params);
    } else {
      await this.databaseService.query(query, params);
    }
  }
}

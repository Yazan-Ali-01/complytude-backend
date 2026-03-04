import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface RulesetChunkMatch {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  distance: number;
}

@Injectable()
export class RulesetChunkSearchRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Batch similarity search: for each query embedding find the top-K nearest ruleset
   * chunks, then deduplicate across all queries keeping the best (lowest) distance per
   * chunk, and return the top `maxUnique` overall.
   *
   * Uses a LATERAL join so the HNSW index is exercised for every individual query vector
   * rather than being bypassed by a plain cross-join.
   *
   * ruleset_chunks has no RLS; bypassRLS is irrelevant.
   */
  async searchSimilarBatch(
    embeddings: number[][],
    topKPerQuery: number,
    maxUnique: number,
  ): Promise<RulesetChunkMatch[]> {
    if (embeddings.length === 0) return [];

    // pg driver serialises a string[] as a PostgreSQL text[], so we format each
    // vector as the text representation pgvector expects: "[x1,x2,...]"
    const vectorStrings = embeddings.map((e) => `[${e.join(',')}]`);

    const result = await this.databaseService.query<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
      distance: number;
    }>(
      `SELECT id, content, metadata, MIN(distance) AS distance
       FROM (
         SELECT rc.id, rc.content, rc.metadata,
                (rc.embedding <=> q.vec::vector) AS distance
         FROM unnest($1::text[]) AS q(vec)
         CROSS JOIN LATERAL (
           SELECT id, content, metadata, embedding
           FROM public.ruleset_chunks
           ORDER BY embedding <=> q.vec::vector
           LIMIT $2
         ) rc
       ) sub
       GROUP BY id, content, metadata
       ORDER BY distance
       LIMIT $3`,
      [vectorStrings, topKPerQuery, maxUnique],
    );

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      metadata:
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : row.metadata,
      distance: parseFloat(row.distance as unknown as string),
    }));
  }
}

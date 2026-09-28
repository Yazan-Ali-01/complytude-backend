import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface RulesetChunkMatch {
  id: string;
  rulesetId: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

const RRF_K = 60;

@Injectable()
export class RulesetChunkSearchRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Hybrid search combining pgvector cosine similarity and BM25 full-text search
   * via Reciprocal Rank Fusion (RRF).
   *
   * 1. Vector branch: LATERAL join per query embedding (HNSW index, top-K per query)
   * 2. BM25 branch: tsvector @@ plainto_tsquery on the generated content_tsv column
   * 3. FULL OUTER JOIN + RRF scoring: 1/(k+rank_vector) + 1/(k+rank_bm25)
   *
   * When `rulesetIds` is provided, both branches are filtered to only those rulesets.
   * ruleset_chunks has no RLS; bypassRLS is irrelevant.
   */
  async hybridSearchBatch(
    embeddings: number[][],
    searchText: string,
    topKPerQuery: number,
    vectorLimit: number,
    bm25Limit: number,
    maxResults: number,
    rulesetIds?: string[],
  ): Promise<RulesetChunkMatch[]> {
    if (embeddings.length === 0) return [];

    const vectorStrings = embeddings.map((e) => `[${e.join(',')}]`);
    const scoped = rulesetIds && rulesetIds.length > 0;

    const vectorWhereClause = scoped
      ? 'WHERE ruleset_id = ANY($7::uuid[])'
      : '';
    const bm25WhereClause = scoped ? 'AND ruleset_id = ANY($7::uuid[])' : '';

    const params: unknown[] = [
      vectorStrings,
      topKPerQuery,
      vectorLimit,
      searchText,
      bm25Limit,
      maxResults,
    ];
    if (scoped) {
      params.push(rulesetIds);
    }

    const result = await this.databaseService.query<{
      id: string;
      ruleset_id: string;
      content: string;
      metadata: Record<string, unknown>;
      rrf_score: number;
    }>(
      `WITH vector_results AS (
        SELECT id, ruleset_id, content, metadata,
               ROW_NUMBER() OVER (ORDER BY distance) AS vrank
        FROM (
          SELECT rc.id, rc.ruleset_id, rc.content, rc.metadata,
                 MIN(rc.embedding <=> q.vec::vector) AS distance
          FROM unnest($1::text[]) AS q(vec)
          CROSS JOIN LATERAL (
            SELECT id, ruleset_id, content, metadata, embedding
            FROM public.ruleset_chunks
            ${vectorWhereClause}
            ORDER BY embedding <=> q.vec::vector
            LIMIT $2
          ) rc
          GROUP BY rc.id, rc.ruleset_id, rc.content, rc.metadata
        ) deduped
        ORDER BY distance
        LIMIT $3
      ),
      bm25_results AS (
        SELECT id, ruleset_id, content, metadata,
               ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, query) DESC) AS brank
        FROM public.ruleset_chunks,
             plainto_tsquery('english', $4) query
        WHERE content_tsv @@ query
        ${bm25WhereClause}
        ORDER BY ts_rank_cd(content_tsv, query) DESC
        LIMIT $5
      ),
      combined AS (
        SELECT
          COALESCE(v.id, b.id) AS id,
          COALESCE(v.ruleset_id, b.ruleset_id) AS ruleset_id,
          COALESCE(v.content, b.content) AS content,
          COALESCE(v.metadata, b.metadata) AS metadata,
          COALESCE(1.0 / (${RRF_K} + v.vrank), 0)
            + COALESCE(1.0 / (${RRF_K} + b.brank), 0) AS rrf_score
        FROM vector_results v
        FULL OUTER JOIN bm25_results b ON v.id = b.id
      )
      SELECT id, ruleset_id, content, metadata, rrf_score
      FROM combined
      ORDER BY rrf_score DESC
      LIMIT $6`,
      params,
    );

    return result.rows.map((row) => ({
      id: row.id,
      rulesetId: row.ruleset_id,
      content: row.content,
      metadata:
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : row.metadata,
      score: parseFloat(row.rrf_score as unknown as string),
    }));
  }
}

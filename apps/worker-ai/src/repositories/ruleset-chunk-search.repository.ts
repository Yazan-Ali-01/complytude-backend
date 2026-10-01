import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface RulesetChunkMatch {
  id: string;
  rulesetId: string;
  rulesetVersionId: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

const RRF_K = 60;

/** Most frequent document stems OR-ed into the BM25 query (the whole text AND-ed matches nothing). */
const BM25_QUERY_TERMS = 64;

@Injectable()
export class RulesetChunkSearchRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Every required clause (`isRequired` in the chunk metadata) of the given rulesets' active
   * versions: the checklist every analysis checks, whatever the similarity search finds.
   */
  async findRequiredClauses(
    rulesetIds: string[],
  ): Promise<RulesetChunkMatch[]> {
    if (rulesetIds.length === 0) return [];
    const { rows } = await this.databaseService.query<{
      id: string;
      ruleset_id: string;
      ruleset_version_id: string;
      content: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT c.id, c.ruleset_id, c.ruleset_version_id, c.content, c.metadata
       FROM public.ruleset_chunks c
       JOIN public.ruleset_versions v ON v.id = c.ruleset_version_id AND v.is_active
       JOIN public.rulesets r ON r.id = c.ruleset_id AND r.status = 'active'
       WHERE c.ruleset_id = ANY($1::uuid[]) AND c.metadata->>'isRequired' = 'true'
       ORDER BY c.ruleset_id, c.chunk_index`,
      [rulesetIds],
    );
    return rows.map((row) => ({
      id: row.id,
      rulesetId: row.ruleset_id,
      rulesetVersionId: row.ruleset_version_id,
      content: row.content,
      metadata:
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : row.metadata,
      score: 0,
    }));
  }

  /**
   * The stored embeddings of the given chunks, to find the document sections each is about. Only
   * those made with `embeddingModel`: another model's vector says nothing about the document's.
   */
  async findEmbeddings(
    chunkIds: string[],
    embeddingModel: string,
  ): Promise<Map<string, number[]>> {
    if (chunkIds.length === 0) return new Map();
    const { rows } = await this.databaseService.query<{
      id: string;
      embedding: string;
    }>(
      `SELECT id, embedding::text AS embedding FROM public.ruleset_chunks
       WHERE id = ANY($1::uuid[]) AND embedding_model = $2`,
      [chunkIds, embeddingModel],
    );
    return new Map(
      rows.map((row) => [row.id, JSON.parse(row.embedding) as number[]]),
    );
  }

  /**
   * Hybrid search combining pgvector cosine similarity and BM25 full-text search
   * via Reciprocal Rank Fusion (RRF).
   *
   * Only chunks of **active** rulesets and their **active** version are searched, so retired
   * regulations and superseded versions are never cited.
   *
   * 1. Vector branch: LATERAL join per query embedding (HNSW index, top-K per query). The
   *    version filter runs inside the index scan with `hnsw.iterative_scan`, so a filtered or
   *    scoped search keeps scanning until it has K rows instead of returning too few.
   * 2. BM25 branch: the document's most frequent English and Arabic stems, OR-ed, against the
   *    generated content_tsv column (English + Arabic stems).
   * 3. FULL OUTER JOIN + RRF scoring: 1/(k+rank_vector) + 1/(k+rank_bm25)
   *
   * When `rulesetIds` is provided, both branches are limited to those rulesets. The vector branch
   * compares only chunks embedded with `embeddingModel`, the model of `embeddings`: vectors of
   * different models are never compared (a version not yet re-embedded is found by BM25 only).
   * ruleset_chunks has no RLS.
   */
  async hybridSearchBatch(
    embeddings: number[][],
    searchText: string,
    topKPerQuery: number,
    vectorLimit: number,
    bm25Limit: number,
    maxResults: number,
    rulesetIds: string[] | undefined,
    embeddingModel: string,
  ): Promise<RulesetChunkMatch[]> {
    if (embeddings.length === 0) return [];

    const vectorStrings = embeddings.map((e) => `[${e.join(',')}]`);
    const scoped = !!rulesetIds && rulesetIds.length > 0;

    return this.databaseService.transaction(async (client) => {
      const { rows: active } = await client.query<{ id: string }>(
        `SELECT v.id
         FROM public.ruleset_versions v
         JOIN public.rulesets r ON r.id = v.ruleset_id
         WHERE v.is_active AND r.status = 'active'
           ${scoped ? 'AND r.id = ANY($1::uuid[])' : ''}`,
        scoped ? [rulesetIds] : [],
      );
      if (active.length === 0) return [];

      // Keep scanning the HNSW graph until the filtered LIMIT is met (pgvector >= 0.8)
      await client.query(`SET LOCAL hnsw.iterative_scan = relaxed_order`);

      const result = await client.query<{
        id: string;
        ruleset_id: string;
        ruleset_version_id: string;
        content: string;
        metadata: Record<string, unknown>;
        rrf_score: number;
      }>(
        `WITH doc_terms AS (
          SELECT lexeme, cardinality(positions) AS freq
          FROM unnest(to_tsvector('english', $4))
          WHERE lexeme !~ '[\u0600-\u06FF]'
          UNION ALL
          SELECT lexeme, cardinality(positions) AS freq
          FROM unnest(to_tsvector('arabic', $4))
          WHERE lexeme ~ '[\u0600-\u06FF]'
        ),
        bm25_query AS (
          SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) AS query
          FROM (
            SELECT lexeme FROM doc_terms
            GROUP BY lexeme ORDER BY sum(freq) DESC, lexeme LIMIT ${BM25_QUERY_TERMS}
          ) top_terms
        ),
        vector_results AS (
          SELECT id, ruleset_id, ruleset_version_id, content, metadata,
                 ROW_NUMBER() OVER (ORDER BY distance) AS vrank
          FROM (
            SELECT rc.id, rc.ruleset_id, rc.ruleset_version_id, rc.content, rc.metadata,
                   MIN(rc.embedding <=> q.vec::vector) AS distance
            FROM unnest($1::text[]) AS q(vec)
            CROSS JOIN LATERAL (
              SELECT id, ruleset_id, ruleset_version_id, content, metadata, embedding
              FROM public.ruleset_chunks
              WHERE ruleset_version_id = ANY($7::uuid[]) AND embedding_model = $8
              ORDER BY embedding <=> q.vec::vector
              LIMIT $2
            ) rc
            GROUP BY rc.id, rc.ruleset_id, rc.ruleset_version_id, rc.content, rc.metadata
          ) deduped
          ORDER BY distance
          LIMIT $3
        ),
        bm25_results AS (
          SELECT c.id, c.ruleset_id, c.ruleset_version_id, c.content, c.metadata,
                 ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.content_tsv, b.query) DESC) AS brank
          FROM public.ruleset_chunks c, bm25_query b
          WHERE c.content_tsv @@ b.query
            AND c.ruleset_version_id = ANY($7::uuid[])
          ORDER BY ts_rank_cd(c.content_tsv, b.query) DESC
          LIMIT $5
        ),
        combined AS (
          SELECT
            COALESCE(v.id, b.id) AS id,
            COALESCE(v.ruleset_id, b.ruleset_id) AS ruleset_id,
            COALESCE(v.ruleset_version_id, b.ruleset_version_id) AS ruleset_version_id,
            COALESCE(v.content, b.content) AS content,
            COALESCE(v.metadata, b.metadata) AS metadata,
            COALESCE(1.0 / (${RRF_K} + v.vrank), 0)
              + COALESCE(1.0 / (${RRF_K} + b.brank), 0) AS rrf_score
          FROM vector_results v
          FULL OUTER JOIN bm25_results b ON v.id = b.id
        )
        SELECT id, ruleset_id, ruleset_version_id, content, metadata, rrf_score
        FROM combined
        ORDER BY rrf_score DESC
        LIMIT $6`,
        [
          vectorStrings,
          topKPerQuery,
          vectorLimit,
          searchText,
          bm25Limit,
          maxResults,
          active.map((v) => v.id),
          embeddingModel,
        ],
      );

      return result.rows.map((row) => ({
        id: row.id,
        rulesetId: row.ruleset_id,
        rulesetVersionId: row.ruleset_version_id,
        content: row.content,
        metadata:
          typeof row.metadata === 'string'
            ? (JSON.parse(row.metadata) as Record<string, unknown>)
            : row.metadata,
        score: parseFloat(row.rrf_score as unknown as string),
      }));
    });
  }
}

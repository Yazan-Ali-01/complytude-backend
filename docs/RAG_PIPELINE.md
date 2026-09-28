# RAG Compliance Analysis Pipeline

How the system analyzes documents against regulatory rulesets using Retrieval-Augmented Generation.

---

## How It Works

A user uploads a contract. The system chunks it, searches for relevant regulatory clauses, and asks an LLM to identify compliance gaps. Results are structured findings with risk levels, clause references, and suggestions.

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐
│   API    │────▶│  BullMQ Queue │────▶│   Worker-AI   │
│ (enqueue)│     │ ai-processing │     │ (RAG pipeline)│
└──────────┘     └──────────────┘     └───────┬───────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                        ┌──────────┐   ┌──────────┐   ┌──────────┐
                        │  Hybrid  │   │  Cohere  │   │  OpenAI  │
                        │  Search  │   │ Re-rank  │   │   LLM    │
                        │(PG+BM25) │   │          │   │(json_schema)│
                        └──────────┘   └──────────┘   └──────────┘
```

---

## The Two Workers

### Worker-AI (analysis)

Consumes `DOCUMENT_ANALYSIS` jobs. Runs the full RAG pipeline:

1. **Chunk** the document text (token-aware splitting)
2. **Embed** chunks via OpenAI (`text-embedding-3-small`, 1536 dimensions)
3. **Hybrid search** against `ruleset_chunks` — vector similarity + BM25 full-text, merged via Reciprocal Rank Fusion
4. **Re-rank** candidates using Cohere (`rerank-v3.5`) — falls back gracefully if unavailable
5. **Build prompt** with top regulatory clauses + document content (context-window aware, truncates if needed)
6. **LLM call** with structured output enforcement (OpenAI `json_schema`, not `json_object`)
7. **Store result** in `analysis_jobs.result` (JSONB)

### Worker-Ingestion (indexing)

Consumes `RULESET_INGESTION` jobs. Prepares rulesets for search:

1. Fetch ruleset version and its JSONB clauses
2. Chunk clauses (clause-aware, token-limited)
3. Generate embeddings for each chunk
4. Atomic replace: delete old chunks → insert new ones in a transaction

Each chunk carries metadata (clause ID, title, authority name, ruleset key, version) for traceability in analysis results.

The `content_tsv` column (tsvector) is a PostgreSQL generated column — it's automatically maintained, so ingestion doesn't need to do anything extra for BM25 support.

---

## Retrieval Strategy

The pipeline uses three stages to find the most relevant regulatory clauses:

### Stage 1: Hybrid Search

Two retrieval methods run in a **single SQL query** (CTEs):

| Method | What it catches | Index |
|--------|----------------|-------|
| **Vector similarity** (pgvector HNSW, cosine distance) | Semantically similar content, even with different wording | `idx_ruleset_chunks_embedding_hnsw` |
| **BM25 full-text** (tsvector + GIN) | Exact keyword matches — regulation numbers, legal terms, specific article references | `idx_ruleset_chunks_content_tsv` |

Results are merged using **Reciprocal Rank Fusion** (RRF, k=60). RRF uses rank position instead of raw scores, which avoids the problem of cosine distance and BM25 ts_rank being on incomparable scales.

- **Only live law:** both branches search only chunks of **active** rulesets and their **active** version. Deactivating a ruleset or publishing a version (`createVersion`, `rollbackVersion`) changes results at once; publishing makes the new version the only active one, and ingestion then deletes the chunks of inactive versions.
- **Filtered vector search:** the version (and optional ruleset scope) filter runs inside the HNSW scan with `SET LOCAL hnsw.iterative_scan = relaxed_order` (pgvector ≥ 0.8), so a narrow scope still returns K rows.
- **BM25 query:** the whole document, reduced to its 64 most frequent stems (English stems of Latin text, Arabic stems of Arabic text) OR-ed together; `content_tsv` holds both English and Arabic stems (migration 027), so Arabic contracts match Arabic regulations by stem.

### Stage 2: Re-ranking

The merged candidates are re-ranked by **Cohere's cross-encoder model** (`rerank-v3.5`), which reads the full query-document pairs to produce a relevance score; any set of two or more is reranked, even when all of it fits in `RERANK_TOP_N`. The query is the title plus up to 8 chunks sampled evenly across the document (4,000 characters), not just its opening. This is more accurate than embedding similarity alone but too expensive to run on all chunks — hence the two-stage approach.

If Cohere is unavailable, the pipeline continues with the hybrid search ordering. The `reranked` field in results indicates whether re-ranking was applied.

### Stage 3: Context-Window Packing

The prompt builder fits as many top clauses as possible into the LLM's context window (128k tokens for `gpt-4o-mini`), reserving space for the system prompt and output tokens. If the document is too large, it's truncated with a notice.

---

## Structured Outputs

The LLM response is enforced via OpenAI's `json_schema` response format — not the weaker `json_object` mode. This means:

- The LLM **must** return valid JSON matching the schema (findings array + summary)
- No manual JSON parsing or regex extraction needed
- If the LLM refuses for safety reasons, a `refusal` field is returned and handled as an error
- If the response is truncated (`finish_reason=length`), it's treated as an error

Schema is defined in `document-analysis.service.ts` as `ANALYSIS_RESULT_SCHEMA`.

---

## Database Tables

### `ruleset_chunks` (global, no RLS)

Stores embedded clause chunks for hybrid search.

| Column | Type | Purpose |
|--------|------|---------|
| `content` | TEXT | Raw clause text |
| `content_tsv` | TSVECTOR (generated) | Auto-maintained BM25 search vector |
| `embedding` | vector(1536) | OpenAI embedding for similarity search |
| `metadata` | JSONB | Clause ID, title, authority, ruleset key, version |

### `analysis_jobs` (tenant-scoped, RLS)

Tracks the lifecycle of each analysis request.

| Column | Type | Purpose |
|--------|------|---------|
| `status` | ENUM | `queued` → `processing` → `completed` / `failed` |
| `result` | JSONB | Findings, summary, model, chunk counts, `reranked` flag |
| `error` | TEXT | Error message if failed |

---

## Analysis Result Shape

```json
{
  "findings": [
    {
      "clauseRef": "DMCC Employment Rule 4.2",
      "riskLevel": "high",
      "title": "Probation exceeds maximum",
      "description": "The contract specifies a 12-month probation...",
      "suggestion": "Reduce probation period to 6 months..."
    }
  ],
  "summary": "The contract contains 3 high-risk violations...",
  "model": "gpt-4o-mini",
  "documentChunks": 4,
  "rulesetChunksMatched": 10,
  "rulesetsConsulted": ["dmcc_employment_regulations_v1", "uae_labour_law_employment_v1"],
  "reranked": true
}
```

---

## Error Handling

| Scenario | Error Type | Behavior |
|----------|-----------|----------|
| DB timeout, embedding API failure | `RetryableError` | BullMQ retries with exponential backoff |
| Cohere API failure | Graceful degradation | Logs warning, skips re-ranking, pipeline continues |
| LLM API error | `RetryableError` | BullMQ retries |
| LLM refusal or truncation | `Error` | Thrown, caught by pipeline, job marked failed |
| Job/document not found | `PermanentError` | No retries, job marked failed immediately |

---

## Environment Variables (worker-ai)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `OPENAI_API_KEY` | Yes | — | Embeddings + LLM |
| `COHERE_API_KEY` | Yes | — | Re-ranking |
| `OPENAI_CHAT_MODEL` | No | `gpt-4o-mini` | LLM model (must support structured outputs) |
| `COHERE_RERANK_MODEL` | No | `rerank-v3.5` | Cohere model |
| `RERANK_TOP_N` | No | `10` | Chunks to keep after re-ranking |

See `apps/worker-ai/.env.example` for the full list.

---

**Last Updated:** March 24, 2026

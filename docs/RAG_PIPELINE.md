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
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                        ┌──────────┐                   ┌──────────┐
                        │  Hybrid  │                   │  OpenAI  │
                        │  Search  │                   │   LLM    │
                        │(PG+BM25) │                   │(json_schema)│
                        └──────────┘                   └──────────┘
```

---

## The Two Workers

### Worker-AI (analysis)

Consumes `DOCUMENT_ANALYSIS` jobs. Runs the full RAG pipeline:

1. **Chunk** the document text (token-aware splitting)
2. **Embed** chunks via OpenAI (`text-embedding-3-large`, 1536 dimensions); vector search compares only ruleset chunks embedded by the same model (`ruleset_chunks.embedding_model`)
3. **Hybrid search** against `ruleset_chunks` — vector similarity + BM25 full-text, merged via Reciprocal Rank Fusion
4. **Keep** the candidates in search order, up to `RAG_OPTIONAL_CLAUSE_LIMIT` (no reranking)
5. **Add the checklist:** every required clause of the job's rulesets, whatever the search found
6. **Judge in batches:** the clauses (required first) go to the model a batch per call, a few calls at a time, up to a call budget; each call sees the whole document, or the sections most relevant to its clauses when the document doesn't fit
7. **LLM call** per batch with structured output enforcement (OpenAI `json_schema`, not `json_object`), restricted to that batch's clause IDs
8. **Store result** in `analysis_jobs.result` (JSONB), with the model calls and tokens used

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

### Stage 2: No reranking

The merged candidates are kept in RRF order, up to `RAG_OPTIONAL_CLAUSE_LIMIT` (25). A Cohere cross-encoder used to reorder them against a query sampled from the contract; with every required clause checked anyway (stage 3), the evaluation scored the analysis no worse without it (`data/eval/HISTORY.md`, rerank `none`), so it was removed: no contract text goes to a reranking provider. A self-hosted multilingual reranker can come back if a later evaluation shows it helps.

### Stage 3: Required clauses

Search finds clauses that resemble the contract, so it misses the ones a contract leaves out. Every chunk marked `isRequired` in the job's rulesets is added to the clauses found by search, so each required clause gets a verdict (`result.requiredClausesChecked`).

### Stage 4: Clause-by-clause judging

The clauses are judged in batches of `RAG_JUDGE_BATCH_SIZE`, `RAG_JUDGE_CONCURRENCY` calls at a time, at most `RAG_MAX_JUDGE_CALLS` calls; clauses beyond that are recorded `unassessed`. Each call's budget is the model's context window minus its output tokens, the instructions and the batch's clauses. A document that fits is sent whole. One that doesn't is sent as its sections most similar to the batch's clauses (cosine between the stored clause embeddings and the document chunk embeddings, `RAG_SECTIONS_PER_CLAUSE` per clause), in document order and labelled `[Part i of n]`, and the model is told that a requirement it can't see met is `unclear`. A section is cut only when a single one doesn't fit. See `apps/worker-ai/docs/README.md` → Clause by clause.

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
| `embedding_model` | VARCHAR(100) | The model behind `embedding` (migration 039); the vector search and the clause-to-section matching use only chunks of the worker's `OPENAI_EMBEDDING_MODEL`. After changing the model, `pnpm rulesets:reingest` re-embeds the active versions; until then they are found by BM25 only |
| `metadata` | JSONB | Clause ID, title, authority, ruleset key, version |

### `analysis_jobs` (tenant-scoped, RLS)

Tracks the lifecycle of each analysis request.

| Column | Type | Purpose |
|--------|------|---------|
| `status` | ENUM | `queued` → `processing` → `completed` / `failed` |
| `result` | JSONB | Findings, summary, model, chunk counts, warnings, provenance |
| `error` | TEXT | Error message if failed |

---

## Analysis Result Shape

```json
{
  "findings": [
    {
      "clauseId": "C3",
      "citation": "Dubai Multi Commodities Centre — DMCC Employment Regulations v1.0.0, Art. 4: DMCC Working Hours",
      "riskLevel": "high",
      "baselineRiskLevel": "high",
      "evidence": "The Employee shall work from 8:00 AM to 6:00 PM, Sunday through Thursday, totaling fifty (50) hours per week.",
      "evidenceOffset": 812,
      "title": "Probation exceeds maximum",
      "description": "The contract specifies a 12-month probation...",
      "suggestion": "Reduce probation period to 6 months..."
    }
  ],
  "summary": "The contract contains 3 high-risk violations...",
  "model": "gpt-5.6-luna",
  "documentChunks": 4,
  "rulesetChunksMatched": 10,
  "rulesetsConsulted": ["dmcc_employment_regulations_v1", "uae_labour_law_employment_v1"]
}
```

---

## Error Handling

| Scenario | Error Type | Behavior |
|----------|-----------|----------|
| DB timeout, embedding API failure | `RetryableError` | BullMQ retries with exponential backoff |
| LLM API error | `RetryableError` | BullMQ retries |
| LLM refusal or truncation | `Error` | Thrown, caught by pipeline, job marked failed |
| Job/document not found | `PermanentError` | No retries, job marked failed immediately |

---

## Environment Variables (worker-ai)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `OPENAI_API_KEY` | Yes | — | Embeddings + LLM |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI host for embeddings and chat; only the global API or a data-residency host (`us`/`eu`/`ae`) |
| `OPENAI_CHAT_MODEL` | No | `gpt-5.6-luna` | LLM model (must support structured outputs); chosen on the evaluation, see `apps/worker-ai/docs/README.md` → Model choice |
| `OPENAI_CHAT_CONTEXT_WINDOW` | For a model outside the known table | — | Context window in tokens (`apps/worker-ai/src/config/chat-model.ts`) |
| `RAG_OPTIONAL_CLAUSE_LIMIT` | No | `25` | Clauses kept from the search (search order) after the required ones |
| `RAG_JUDGE_BATCH_SIZE` | No | `8` | Clauses judged per model call |
| `RAG_JUDGE_CONCURRENCY` | No | `3` | Model calls in flight per analysis |
| `RAG_MAX_JUDGE_CALLS` | No | `10` | Model calls per analysis at most |
| `RAG_SECTIONS_PER_CLAUSE` | No | `4` | Nearest document sections per clause, for a document too long to send whole |

See `apps/worker-ai/.env.example` for the full list.

---

**Last Updated:** March 24, 2026

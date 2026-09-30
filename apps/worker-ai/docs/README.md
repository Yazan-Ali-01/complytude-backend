# AI Worker Documentation

**Status:** Implemented  
**Queue:** `ai-processing`  
**Port:** 3001 (configurable)

---

## Overview

The AI Worker is a standalone NestJS application that consumes jobs from the `ai-processing` BullMQ queue. It performs AI-powered compliance analysis on documents using a RAG (Retrieval-Augmented Generation) pipeline with hybrid search and re-ranking.

### What It Does

1. Receives `DOCUMENT_ANALYSIS` jobs dispatched by the API
2. Fetches the document content from PostgreSQL
3. Chunks the document text and generates embeddings (OpenAI)
4. Performs **hybrid search** — vector similarity (pgvector HNSW) + BM25 full-text search (tsvector GIN) merged via Reciprocal Rank Fusion (RRF)
5. **Re-ranks** retrieved chunks using Cohere's rerank model (graceful fallback if unavailable)
6. Builds a context-enriched prompt with the top regulatory clauses
7. Calls the LLM (OpenAI GPT) with **structured output** enforcement (JSON Schema)
8. Stores the typed analysis result and marks the job complete

### RAG Pipeline

```
Document → Chunk → Embed → Hybrid Search (Vector + BM25 / RRF) → Cohere Re-rank → Prompt Build → LLM (Structured Output) → Store Result
```

---

## Architecture

### Shared Libraries

| Library | Usage |
|---------|-------|
| `@lib/database` | PostgreSQL connection for reading documents and writing results |
| `@lib/embedding` | OpenAI embeddings API + text chunking (TextChunkerService) |
| `@lib/queue` | BullMQ consumer registration (AbstractProcessor) |
| `@lib/redis` | Redis connection for BullMQ |

### External APIs

| Provider | Usage |
|----------|-------|
| **OpenAI** | Embeddings (`text-embedding-3-small`) + LLM chat completions (`gpt-4o-mini`, structured output with `json_schema`) |
| **Cohere** | Re-ranking retrieved chunks (`rerank-v3.5`) — optional, graceful degradation on failure |

### Source Structure

```
apps/worker-ai/src/
├── main.ts                          # Bootstrap (NestJS + shutdown hooks)
├── worker-ai.module.ts              # Root module
├── worker-ai.controller.ts          # Health/status endpoints
├── config/
│   ├── env.schema.ts                # Joi validation for env vars
│   └── worker-ai.config.ts          # ConfigService factory
├── processors/
│   └── ai-processing.processor.ts   # BullMQ processor (routes by job.name)
├── services/
│   ├── document-analysis.service.ts # RAG pipeline orchestration
│   ├── llm.service.ts               # OpenAI chat completions (structured output, json_schema)
│   ├── prompt-builder.service.ts    # System prompt + context window management
│   └── reranker.service.ts          # Cohere rerank integration (graceful fallback)
├── eval/
│   ├── eval-case.ts                 # Evaluation case and run types (data/eval/cases)
│   ├── scorer.ts                    # Scores runs against the labels (pure, unit-tested)
│   └── report.ts                    # Markdown report + HISTORY.md row
├── repositories/
│   ├── document-read.repository.ts       # Read document content (job's tenant context)
│   ├── analysis-job-write.repository.ts  # Claim, mark processing/completed/failed
│   └── ruleset-chunk-search.repository.ts # Hybrid search (vector + BM25, RRF merge)
└── interfaces/
    └── analysis-result.interface.ts      # AnalysisResult, AnalysisFinding types
```

### Job Flow

```
API dispatches job:
  QueueProducerService.enqueue(AI_PROCESSING, DOCUMENT_ANALYSIS, { analysisJobId, documentId })
                              ↓
AiProcessingProcessor.handle(job)
  → Routes to DocumentAnalysisService.analyze(data)
                              ↓
DocumentAnalysisService pipeline:
  1. Verify + claim analysis job (CAS: queued/processing → processing)
  2. Fetch document content
  3. Chunk document text (TextChunkerService)
  4. Embed all chunks (EmbeddingService → OpenAI)
  5. Hybrid search (vector HNSW + BM25 tsvector, merged via RRF, top 20)
  6. Cohere re-rank (top 10, graceful fallback to original ranking)
     No clauses left → the job fails ("nothing was checked"); the model is not called
  7. Build prompt: clauses (C1…Cn) in the system message, the document in a nonce-delimited
     untrusted block in the user message (context-window aware)
  8. LLM call (OpenAI, structured output; clauseId limited to the supplied IDs)
  9. Keep only findings citing a supplied clause, work out warnings, store the result:
     completed, or completed_with_warnings
```

### Retrieval Strategy

The worker uses a **hybrid retrieval** approach combining two complementary search methods:

- **Vector search (semantic):** pgvector HNSW index with cosine distance. Finds chunks that are semantically similar to document content, even when different wording is used.
- **BM25 full-text search (lexical):** PostgreSQL tsvector/GIN index. Catches exact keyword matches (e.g., specific regulation numbers like "Article 14.3") that embeddings may miss.
- **Reciprocal Rank Fusion (RRF):** Combines results from both methods using rank position (not raw scores), with `k=60`. This avoids the problem of incomparable score scales between cosine distance and BM25 ts_rank.
- **Cohere re-ranking:** The merged candidates are re-ranked by a dedicated cross-encoder model for final relevance ordering, against a query sampled across the whole document.
- **Scope:** only active rulesets and their active version are searched; a scoped search uses pgvector iterative scan so it still returns K rows; BM25 covers English and Arabic stems. See `docs/RAG_PIPELINE.md`.

### Error Handling

| Error Type | Behavior |
|-----------|----------|
| `RetryableError` | DB timeouts, embedding API failures, LLM API errors, Cohere API errors → BullMQ retries with exponential backoff |
| `PermanentError` | Job/document not found, terminal job state → moves to failed, no retries |
| Cohere failure | Graceful degradation: falls back to original hybrid ranking, logs warning, pipeline continues |
| Pipeline failure | `markFailed(jobId, errorMessage)` only for a `PermanentError` or the last attempt; otherwise the job stays `processing` for BullMQ's next attempt |

### Prompt injection and grounding

Contracts are untrusted: the counterparty drafts them. The system message holds our instructions and the retrieved clauses, each with an ID (`C1`, `C2`, …). The document goes in the user message between `<<<DOCUMENT-{nonce}>>>` and `<<<END-DOCUMENT-{nonce}>>>`, with a random nonce per call; anything in the document that looks like one of those markers is replaced, and the model is told to treat the block as data and to report text that tries to steer the review. Every finding must carry a `clauseId` from the supplied set (the JSON schema enumerates them); findings that don't are dropped and counted.

### Citations and severity

The model never writes a citation. Each clause in the prompt is headed with the citation built from its ruleset data (`citation.ts`: authority, ruleset name, version, article or section, title), and the finding stores that same citation. A finding's `riskLevel` starts from the clause's own `severity` (critical/high → high, medium → medium, low → low); the model can only raise it, and its `riskReason` is kept when it does. Clauses without a severity take the model's level.

This needs the clause facts on every chunk (`isRequired`, `severity`, `article`, `section`, `source`, `rulesetName`, written by worker-ingestion). Chunks ingested before those fields existed cite only the ruleset and title: re-ingest them with `pnpm rulesets:reingest` (see `docs/DEPLOYMENT.md`).

### Evidence

Every finding quotes the contract passage it is about (`evidence`, at most about 300 characters). `evidence.ts` looks the quote up in the document's text, ignoring what a model changes when it copies text (spacing and line breaks, case, typographic quotes and dashes, Arabic diacritics and tatweel), and stores the passage exactly as it appears with its offset, so the UI can highlight it. A quote that isn't in the document (or is shorter than 8 or longer than 600 characters once normalised) drops the finding, counted in `unverifiedFindingsDropped` with the warning `unverified_evidence_dropped`. An empty quote is accepted only for a clause marked `[required]` in the prompt: the finding is then that the contract leaves it out.

### What leaves the worker

- **OpenAI embeddings:** the document's chunks. **Cohere rerank:** chunks sampled across the document. **OpenAI chat:** the document (up to the context budget) and the retrieved clauses.
- **Never sent:** the document title. Upload titles are filenames and often name a party; they add nothing to the review. (The BM25 query that uses it runs in our own Postgres.)
- **Logs** identify a document by its ID only. `libs/logger/src/no-secrets-in-logs.spec.ts` fails the build if a log call interpolates a title, content or generation variables.
- Personal data inside the document text still reaches the providers: there is no redaction step yet.

### Job status

| Status | When |
|---|---|
| `completed` | Full document, reranked context from every requested ruleset, at least one grounded finding. |
| `completed_with_warnings` | Otherwise; `result.warnings` says why: `document_truncated`, `not_reranked`, `rulesets_without_context`, `ungrounded_findings_dropped`, `unverified_evidence_dropped`, `no_findings` (nothing reported is not a compliance verdict). |
| `failed` | Including when retrieval returned no clauses at all. |

The API refuses (400) unknown or inactive `rulesetKeys` / `rulesetIds` instead of widening the search.

### Analysis Result Schema

```typescript
interface AnalysisResult {
  findings: Array<{
    clauseId: string;      // The supplied clause cited (C1, C2, …)
    citation: string;      // Built from the clause's ruleset data, never by the model:
                           // "<authority> — <ruleset> v<version>, <article>: <title>"
    riskLevel: 'high' | 'medium' | 'low';          // The clause's own severity, or higher if the model raised it
    baselineRiskLevel: 'high' | 'medium' | 'low' | null; // From the clause's severity (critical/high → high)
    riskReason?: string;   // The model's one-line reason, kept only when it raised the level
    evidence: string;      // The contract passage, exactly as in the document; "" only for a required clause left out
    evidenceOffset: number | null; // Where evidence starts in the document text (null: omission, or found only in the sectioned text)
    title: string;         // Short issue title
    description: string;   // Detailed compliance gap description
    suggestion: string;    // Concrete recommendation
    chunkId: string;       // The ruleset chunk behind clauseId
    rulesetKey: string | null;
  }>;
  summary: string;         // What was checked and found (2-4 sentences)
  model: string;           // LLM model used (e.g., "gpt-4o-mini")
  documentChunks: number;  // Number of document chunks processed
  rulesetChunksMatched: number; // Unique regulatory chunks after re-ranking
  rulesetsConsulted: string[];  // Ruleset keys of the clauses supplied
  rulesetsCited: string[];      // Ruleset keys at least one finding cites
  rulesetIdsSearched: string[]; // Requested scope; empty = all rulesets
  rulesetIdsWithoutContext: string[]; // Requested rulesets that contributed no clause
  reranked: boolean;       // Whether Cohere re-ranking was applied
  truncated: boolean;      // Whether only part of the document fit
  ungroundedFindingsDropped: number;
  unverifiedFindingsDropped: number; // Findings whose quote isn't in the document
  warnings: string[];      // See "Job status"
  provenance: {            // What produced this result, to reproduce and compare runs
    promptVersion: number;       // PROMPT_VERSION in prompt-builder.service.ts
    embeddingModel: string;
    rulesetVersionIds: string[]; // Versions of the rulesets whose clauses the model saw
    suppliedChunkIds: string[];  // The chunks behind C1, C2, … in order
    retrieval: { topKPerQuery: number; vectorLimit: number; bm25Limit: number;
                 maxHybridResults: number; rerankModel: string; rerankTopN: number };
  };
}
```

---

## Evaluation

`pnpm eval:ai` measures whether the analysis is **right**, which the unit and integration tests (fake model) can't. It runs this worker's real pipeline (retrieval, rerank, prompt, model, grounding) with the real providers over the labelled contracts in `data/eval/`, on a fresh migrated database (testcontainers, Docker required), and scores every finding against the labels.

```bash
pnpm eval:ai                                  # 3 runs per contract; needs OPENAI_API_KEY and COHERE_API_KEY
EVAL_RUNS=5 EVAL_CASES=mainland-employment pnpm eval:ai
EVAL_PROVIDERS=fake pnpm eval:ai              # no keys, no cost: checks the harness only
```

Keys and model settings come from the shell or `apps/worker-ai/.env`, and are checked with this worker's env rules (the OpenAI host allowlist included). The rulesets in `data/eval/rulesets/` are ingested with the real ingestion code, so their embeddings match the configured model. A real run costs roughly (contracts × runs) analyses, plus embedding about 80 clauses once.

Each run writes `data/eval/results/<timestamp>-<commit>.md` and `.json` (per-run findings), and appends one row to `data/eval/HISTORY.md`. Fake runs write to a temp directory and never touch the history.

| Score | Meaning |
|---|---|
| Recall | Expected findings reported / expected findings. A failed run reports nothing. |
| Precision | (expected + acceptable) / (expected + acceptable + must-not-flag) findings: labelled findings only. |
| Strict precision | The same over **all** findings: unlabelled findings count as wrong (a lower bound). |
| Must-not-flag hits | Findings on a clause or ruleset the label says doesn't apply (e.g. federal labour law on a DIFC contract). |
| Severity | Matched findings whose highest risk level equals the label. |
| Mentions | Required mentions found in titles, descriptions or the summary (e.g. the injection attempt is reported). |
| Citations | Findings whose stored citation is the one their clause's ruleset data gives. |
| Evidence | The model's findings whose quote holds up: stored quotes re-checked against the contract, findings the worker dropped for a quote not in it counted as failures. |
| Agreement | Mean pairwise overlap (Jaccard) of the clauses flagged by repeated runs of the same contract. |

The report also lists, per contract, the expected clauses missed, the must-not-flag hits, and the unlabelled findings (candidates for new labels).

**Rule:** any change to the prompt, the model, the embedding model or retrieval records a run in `HISTORY.md` before and after, and bumps `PROMPT_VERSION` when the prompt or output schema changes. The eval isn't in CI (it costs money and isn't deterministic); `apps/worker-ai/src/eval/scorer.spec.ts` covers the scorer in CI. How the labels are written: `data/eval/README.md`.

---

## Quick Start

```bash
# Start AI worker (from project root)
pnpm start:worker-ai

# Start in development mode with hot-reload
pnpm start:worker-ai

# Start with debug mode
pnpm start:worker-ai:debug

# Build for production
pnpm build:worker-ai

# Run production build
pnpm start:worker-ai:prod
```

---

## Environment Variables

Create a `.env` file in `apps/worker-ai/`:

```bash
cp apps/worker-ai/.env.example apps/worker-ai/.env
```

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_AI_PORT` | `3001` | HTTP port for health checks |
| `OPENAI_API_KEY` | (required) | OpenAI API key (shared for embeddings + LLM) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI host for embeddings and chat. Only the global API or a data-residency host (`https://us.api.openai.com/v1`, `https://eu.api.openai.com/v1`, `https://ae.api.openai.com/v1`) is accepted, so document text can't be sent anywhere else. Must match worker-ingestion's. |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | LLM model for analysis (must support structured outputs). Known models (and their dated snapshots) are listed in `src/config/chat-model.ts`. |
| `OPENAI_CHAT_CONTEXT_WINDOW` | known models: from the table | Context window in tokens. **Required** for a model outside the table: the worker refuses to start without it rather than guess. |
| `OPENAI_CHAT_MAX_TOKENS` | `4096` | Max output tokens, sent as `max_completion_tokens`. Reasoning models count their reasoning tokens against it. The prompt budget reserves this many tokens. |
| `OPENAI_CHAT_TEMPERATURE` | known models: `0.1`; others: not sent | LLM temperature. Leave it unset for reasoning models, which reject one. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` | Embedding vector dimensions |
| `COHERE_API_KEY` | (required) | Cohere API key for re-ranking |
| `COHERE_RERANK_MODEL` | `rerank-v3.5` | Cohere rerank model |
| `RERANK_TOP_N` | `10` | Number of chunks to keep after re-ranking |
| `WORKER_AI_CONCURRENCY` | `5` | Max concurrent jobs |
| `REDIS_HOST` | `localhost` | Redis host for BullMQ |
| `DB_HOST` | `localhost` | PostgreSQL host |

See `.env.example` for the full list.

---

## Related Documentation

- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture and queue topology
- [Database Schema](../../../docs/DATABASE.md) - `analysis_jobs` and `ruleset_chunks` tables
- [Monorepo Documentation](../../../docs/README.md) - System-wide documentation

---

**Last Updated:** March 24, 2026

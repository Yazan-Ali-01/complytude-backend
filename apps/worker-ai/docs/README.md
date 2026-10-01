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
5. Keeps the clauses found by similarity in search order, up to `RAG_OPTIONAL_CLAUSE_LIMIT` (no reranking: the evaluation found the search order no worse than Cohere's rerank)
6. Adds **every required clause** of the applicable rulesets, whatever the search found
7. **Judges the clauses in batches** (a few calls at a time), each call with the whole document or, when it doesn't fit, the sections most relevant to its clauses
8. Calls the LLM (OpenAI GPT) with **structured output** enforcement (JSON Schema)
9. Stores the typed analysis result and marks the job complete

### RAG Pipeline

```
Document → Redact → Chunk → Embed → Required clauses + Hybrid Search (Vector + BM25 / RRF, top RAG_OPTIONAL_CLAUSE_LIMIT)
         → Batches of clauses → Prompt per batch → LLM (Structured Output), a few at a time → Merge → Store Result
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
| **OpenAI** | Embeddings (`text-embedding-3-small`) + LLM chat completions (`gpt-5.6-luna`, structured output with `json_schema`) |

### Model choice

Picked on the evaluation (`data/eval/HISTORY.md`, 2026-10-01, same commit and settings; cost per analysis at list prices from the runs' recorded tokens, about 7,600 prompt tokens and 2.6 calls per analysis):

| Chat model | Runs | Recall | Precision | Strict | Must-not-flag hits | Agreement | Cost per analysis |
|---|---|---|---|---|---|---|---|
| **gpt-5.6-luna** (chosen) | 9×3 | 99% | 96% | 75% | 12 in 27 | 97% | ~$0.007 ($0.20/$1.20 per 1M; +10% on the UAE route) |
| gpt-4o-mini (previous) | 9×3 | 96% | 97% | 76% | 9 in 27 | 96% | ~$0.002 (estimated: its runs predate token recording; not offered on the UAE route) |
| gpt-5.2-2025-12-11 (fallback) | 9×1 | 95% | 95% | 71% | 5 in 9 | – | ~$0.07 |
| gpt-5.5-2026-04-23 (frontier) | 9×1 | 100% | 89% | 68% | 15 in 9 | – | ~$0.24 |

gpt-5.6-luna finds the most of the cheap models, agrees with itself run to run (97%, so no second pass is needed), and is on OpenAI's UAE data-residency list; the frontier model finds no more and flags far more that it shouldn't, at 35× the cost. Known gap: it doesn't mention a steering attempt in the contract (the injection cases' "Mentions" score is 0%), though the attempt doesn't change its verdicts.

**Region and retention:** requests go to `OPENAI_BASE_URL`: the global API until OpenAI approves the project for UAE data residency, then `https://ae.api.openai.com/v1` (which also needs `text-embedding-3-large` for embeddings). OpenAI keeps API data up to 30 days for abuse monitoring unless zero data retention is approved; see `docs/SUBPROCESSORS.md`.

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
│   └── prompt-builder.service.ts    # System prompt + context window management
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
  5. Required clauses of the rulesets, then hybrid search (vector HNSW + BM25 tsvector, merged
     via RRF) in its order, up to RAG_OPTIONAL_CLAUSE_LIMIT (25)
  6. No clauses left → the job fails ("nothing was checked"); the model is not called
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
- **No reranking:** the merged candidates are used in RRF order. A Cohere rerank (a query sampled from the document) used to reorder them; the evaluation scored the analysis no worse without it (`data/eval/HISTORY.md`, rerank `none`), so no document text goes to a reranking provider.
- **Scope:** only active rulesets and their active version are searched; a scoped search uses pgvector iterative scan so it still returns K rows; BM25 covers English and Arabic stems. See `docs/RAG_PIPELINE.md`.

### Clause by clause

Similarity decides which optional clauses the model sees, but it can't be trusted to surface an omission: a contract that leaves out a required clause has no text similar to it. So the checklist comes first:

- **Required clauses:** every chunk marked `isRequired` of the job's rulesets (active rulesets, active version) is supplied, whatever the search returned. `result.requiredClausesChecked` counts them.
- **Optional clauses:** the hybrid search results, minus the required ones, in search order up to `RAG_OPTIONAL_CLAUSE_LIMIT`.
- **Batches:** the supplied clauses (required first) are judged `RAG_JUDGE_BATCH_SIZE` per call, `RAG_JUDGE_CONCURRENCY` calls at a time, at most `RAG_MAX_JUDGE_CALLS` calls. Each call's schema allows only its own clause IDs, and a finding that cites another batch's clause is dropped as ungrounded. Clauses beyond the call budget are `unassessed` (warning `clauses_not_assessed`), never silently compliant.
- **Long documents:** a call gets the whole document when it fits the context budget. Otherwise it gets the sections (the embedded chunks) most similar to its clauses, each clause's `RAG_SECTIONS_PER_CLAUSE` nearest pooled, as many as fit, in document order and labelled `[Part i of n]`; the model is told that a requirement it can't see met is `unclear`, not `violated`. `result.documentExcerpted` says whether any call saw excerpts. Text is cut only when a single section doesn't fit (`truncated`, warning `document_truncated`).
- **Cost:** `result.usage` records the model calls and the prompt, completion and embedding tokens of the analysis; the judging settings are in `provenance.judging`.

### Error Handling

| Error Type | Behavior |
|-----------|----------|
| `RetryableError` | DB timeouts, embedding API failures, LLM API errors → BullMQ retries with exponential backoff |
| `PermanentError` | Job/document not found, terminal job state → moves to failed, no retries |
| Pipeline failure | `markFailed(jobId, errorMessage)` only for a `PermanentError` or the last attempt; otherwise the job stays `processing` for BullMQ's next attempt. A job marked failed gives the tenant its contract review back: a `USAGE_REFUND` job on `entitlement-processing` (job id `usage-refund-review-<analysisJobId>`, so a repeated failure refunds once) |

### Prompt injection and grounding

Contracts are untrusted: the counterparty drafts them. The system message holds our instructions and the retrieved clauses, each with an ID (`C1`, `C2`, …). The document goes in the user message between `<<<DOCUMENT-{nonce}>>>` and `<<<END-DOCUMENT-{nonce}>>>`, with a random nonce per call; anything in the document that looks like one of those markers is replaced, and the model is told to treat the block as data and to report text that tries to steer the review. Every finding must carry a `clauseId` from the supplied set (the JSON schema enumerates them); findings that don't are dropped and counted.

### Citations and severity

The model never writes a citation. Each clause in the prompt is headed with the citation built from its ruleset data (`citation.ts`: authority, ruleset name, version, article or section, title), and the finding stores that same citation. A finding's `riskLevel` starts from the clause's own `severity` (critical/high → high, medium → medium, low → low); the model can only raise it, and its `riskReason` is kept when it does. Clauses without a severity take the model's level.

This needs the clause facts on every chunk (`isRequired`, `severity`, `article`, `section`, `source`, `rulesetName`, written by worker-ingestion). Chunks ingested before those fields existed cite only the ruleset and title: re-ingest them with `pnpm rulesets:reingest` (see `docs/DEPLOYMENT.md`).

### Evidence

Every finding quotes the contract passage it is about (`evidence`, at most about 300 characters). `evidence.ts` looks the quote up in the document's text, ignoring what a model changes when it copies text (spacing and line breaks, case, typographic quotes and dashes, Arabic diacritics and tatweel), and stores the passage exactly as it appears with its offset, so the UI can highlight it. A quote that isn't in the document (or is shorter than 8 or longer than 600 characters once normalised) drops the finding, counted in `unverifiedFindingsDropped` with the warning `unverified_evidence_dropped`. An empty quote is accepted only for a clause marked `[required]` in the prompt: the finding is then that the contract leaves it out.

### Redaction

The first step of every analysis (`src/redaction/`). Chunking, embeddings and the prompt only ever see the redacted text; a failure fails the attempt (retryable) before any provider is called.

- **Detected** (`detectors.ts`): Emirates IDs (check digit validated; the `784-XXXX-XXXXXXX-X` shape also when partly masked), IBANs (mod-97), passport numbers (after "passport" / "جواز"), UAE phone numbers, emails, P.O. boxes, villa/flat/building/street addresses, the **parties the preamble defines** (`Name, … ("Employer")`), names after an honorific (Mr, Ms, Dr, Sheikh, السيد, الشيخ, …) or a `Name:` / `الاسم:` label, and names from the name-recognition service when configured.
- **Placeholders** (`redactor.ts`): a party keeps its contractual role (`[EMPLOYER]`, `[FIRST_SHAREHOLDER]`), others are numbered (`[PERSON_1]`, `[EMIRATES_ID_1]`); the same value always gets the same placeholder, and a known name is replaced wherever it appears (a surname after an honorific gets `[EMPLOYEE_SURNAME]`). A company's legal form stays (`[COMPANY] DMCC`) because it tells the jurisdiction.
- **Kept**, because the rules test them: amounts, dates, durations, percentages, working hours, governing law, authority and free-zone names.
- **Put back**: the placeholder map lives in memory for the job only. Titles, descriptions, suggestions, reasons and the summary are re-hydrated before storing; a quote is found in the redacted text and mapped back to the contract's exact passage and offset.
- **Names in the body** with no honorific or label need the name-recognition service: `REDACTION_NER_URL` points at a self-hosted service speaking the Presidio analyzer API (`POST /analyze`, PERSON only, languages from `REDACTION_NER_LANGUAGES`). Without it the worker logs a warning at start. Never point it at an external API: that would be one more processor receiving the contract.
- `REDACTION_ENABLED=false` switches it off in development only (the env schema refuses it in production). Each result records `provenance.redaction` (whether it ran, how many values it masked).

### What leaves the worker

- **OpenAI embeddings:** the document's chunks. **OpenAI chat:** per batch of clauses, the document (or its sections most relevant to the batch) and the batch's clauses.
- **Never sent:** the document title. Upload titles are filenames and often name a party; they add nothing to the review. (The BM25 query that uses it runs in our own Postgres.)
- **Logs** identify a document by its ID only. `libs/logger/src/no-secrets-in-logs.spec.ts` fails the build if a log call interpolates a title, content or generation variables.
- **Personal data** in the text is replaced with placeholders first (below): the providers see `[EMPLOYEE]`, `[EMIRATES_ID_1]`, never the values.

### Job status

| Status | When |
|---|---|
| `completed` | No section cut, context from every requested ruleset, every supplied clause judged, at least one grounded finding. |
| `completed_with_warnings` | Otherwise; `result.warnings` says why: `document_truncated`, `rulesets_without_context`, `ungrounded_findings_dropped`, `unverified_evidence_dropped`, `inconsistent_findings_dropped`, `clauses_not_assessed`, `no_findings` (nothing reported is not a compliance verdict). |
| `failed` | Including when retrieval returned no clauses at all. |

The API refuses (400) unknown or inactive `rulesetKeys` / `rulesetIds` instead of widening the search.

### Scope and verdicts

Every job is scoped: the API resolves the contract's `jurisdiction` and `documentType` to the rulesets tagged with both, or takes explicitly picked rulesets, and queues their IDs (`rulesetIds`) with the jurisdiction and document type. There is no all-rulesets analysis (see `apps/api/docs/API_CONTRACTS.md` → Compliance Analysis Scope). The system prompt says what the contract is ("The document is an employment contract governed in the Dubai International Financial Centre (DIFC)") and that a clause which doesn't govern it is `not_applicable`.

The model gives every supplied clause a verdict: `violated`, `compliant`, `not_applicable` or `unclear`. Only violated or unclear clauses may carry findings; a finding on a clause the model itself called compliant or not applicable is dropped (`inconsistentFindingsDropped`, warning `inconsistent_findings_dropped`). `result.clauseVerdicts` stores one entry per supplied clause with its citation and reason; a clause with no verdict is `unassessed` (warning `clauses_not_assessed`), or `violated` when a finding on it survived.

### Analysis Result Schema

```typescript
interface AnalysisResult {
  clauseVerdicts: Array<{  // One per supplied clause
    clauseId: string; chunkId: string; citation: string; reason: string;
    status: 'violated' | 'compliant' | 'not_applicable' | 'unclear' | 'unassessed';
  }>;
  scope: { jurisdiction: string | null; documentType: string | null };
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
  model: string;           // LLM model used (e.g., "gpt-5.6-luna")
  documentChunks: number;  // Number of document chunks processed
  rulesetChunksMatched: number; // Clauses supplied: required + optional (search order)
  requiredClausesChecked: number; // Required clauses of the rulesets, supplied whatever the search found
  rulesetsConsulted: string[];  // Ruleset keys of the clauses supplied
  rulesetsCited: string[];      // Ruleset keys at least one finding cites
  rulesetIdsSearched: string[]; // Requested scope; empty = all rulesets
  rulesetIdsWithoutContext: string[]; // Requested rulesets that contributed no clause
  truncated: boolean;      // A single section didn't fit a call and was cut
  documentExcerpted: boolean; // Some call saw the most relevant sections, not the whole document
  usage: { modelCalls: number; promptTokens: number; completionTokens: number; embeddingTokens: number };
  ungroundedFindingsDropped: number;
  unverifiedFindingsDropped: number; // Findings whose quote isn't in the document
  inconsistentFindingsDropped: number; // Findings on a clause the model called compliant or not applicable
  warnings: string[];      // See "Job status"
  provenance: {            // What produced this result, to reproduce and compare runs
    // Every third party that received this document's data (docs/SUBPROCESSORS.md), in order:
    // OCR at upload (its pages), OpenAI embeddings, OpenAI analysis.
    // region: the OpenAI host's data-residency region or 'global'; null for OCR (set in Azure)
    processors: Array<{ processor: 'openai' | 'azure-document-intelligence';
                        purpose: 'embeddings' | 'analysis' | 'ocr';
                        region: string | null; model?: string; pages?: number[] }>;
    promptVersion: number;       // PROMPT_VERSION in prompt-builder.service.ts
    redaction: { enabled: boolean; valuesMasked: number };
    embeddingModel: string;
    rulesetVersionIds: string[]; // Versions of the rulesets whose clauses the model saw
    suppliedChunkIds: string[];  // The chunks behind C1, C2, … in order
    judging: { batchSize: number; concurrency: number; maxCalls: number; sectionsPerClause: number };
    retrieval: { topKPerQuery: number; vectorLimit: number; bm25Limit: number;
                 maxHybridResults: number; optionalClauseLimit: number };
  };
}
```

---

## Evaluation

`pnpm eval:ai` measures whether the analysis is **right**, which the unit and integration tests (fake model) can't. It runs this worker's real pipeline (retrieval, prompt, model, grounding) with the real providers over the labelled contracts in `data/eval/`, on a fresh migrated database (testcontainers, Docker required), and scores every finding against the labels.

```bash
pnpm eval:ai                                  # 3 runs per contract; needs OPENAI_API_KEY
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
| Redaction | For cases with a `pii` list: the personal-data values that never appeared in anything sent to a provider (the runner records every embedding input and prompt). `EVAL_REDACTION=off` runs without redaction, to compare the analysis scores with and without it. |

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
| `OPENAI_CHAT_MODEL` | `gpt-5.6-luna` | LLM model for analysis (must support structured outputs); see Model choice. Known models (and their dated snapshots) are listed in `src/config/chat-model.ts`. |
| `OPENAI_CHAT_CONTEXT_WINDOW` | known models: from the table | Context window in tokens. **Required** for a model outside the table: the worker refuses to start without it rather than guess. |
| `OPENAI_CHAT_MAX_TOKENS` | `32000` for a known reasoning model, else `4096` | Max output tokens, sent as `max_completion_tokens`. Reasoning models count their reasoning tokens against it. The prompt budget reserves this many tokens. |
| `OPENAI_CHAT_TEMPERATURE` | known non-reasoning models: `0.1`; others: not sent | LLM temperature. Never sent to a known reasoning model (gpt-5.x), which rejects one. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` | Embedding vector dimensions |
| `REDACTION_ENABLED` | `true` | Mask personal data before any provider call. Only development may set `false`. |
| `REDACTION_NER_URL` | (unset) | Self-hosted name-recognition service (Presidio analyzer API), e.g. a sidecar on `http://localhost:5002` |
| `REDACTION_NER_LANGUAGES` | `en` | Comma-separated languages to ask it for (e.g. `en,ar` with an Arabic model loaded) |
| `REDACTION_NER_TIMEOUT_MS` | `10000` | Per-request timeout; a timeout fails the attempt |
| `RAG_OPTIONAL_CLAUSE_LIMIT` | `25` | Most clauses taken by similarity (search order) after the rulesets' required ones |
| `RAG_JUDGE_BATCH_SIZE` | `8` | Clauses judged per model call (1–40) |
| `RAG_JUDGE_CONCURRENCY` | `3` | Model calls in flight per analysis (1–10) |
| `RAG_MAX_JUDGE_CALLS` | `10` | Model calls per analysis at most (1–50); clauses beyond `batch size × calls` are `unassessed` |
| `RAG_SECTIONS_PER_CLAUSE` | `4` | For a document too long to send whole: nearest sections taken per clause (1–20) |
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

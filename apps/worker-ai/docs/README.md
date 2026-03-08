# AI Worker Documentation

**Status:** Implemented  
**Queue:** `ai-processing`  
**Port:** 3001 (configurable)

---

## Overview

The AI Worker is a standalone NestJS application that consumes jobs from the `ai-processing` BullMQ queue. It performs AI-powered compliance analysis on documents using a RAG (Retrieval-Augmented Generation) pipeline.

### What It Does

1. Receives `DOCUMENT_ANALYSIS` jobs dispatched by the API
2. Fetches the document content from PostgreSQL
3. Chunks the document text and generates embeddings (OpenAI)
4. Performs vector similarity search against embedded ruleset clauses (pgvector)
5. Builds a context-enriched prompt with matched regulatory clauses
6. Calls the LLM (OpenAI GPT) for compliance analysis
7. Parses and validates the structured JSON response
8. Stores the analysis result and marks the job complete

### RAG Pipeline

```
Document → Chunk → Embed → pgvector Search → Top-K Clauses → Prompt Build → LLM → Parse → Store Result
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
│   ├── llm.service.ts               # OpenAI chat completions (JSON mode)
│   └── prompt-builder.service.ts    # System prompt + context window management
├── repositories/
│   ├── document-read.repository.ts       # Read document content
│   ├── analysis-job-write.repository.ts  # Claim, mark processing/completed/failed
│   └── ruleset-chunk-search.repository.ts # pgvector cosine similarity search
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
  5. Batch similarity search (pgvector HNSW, top-K per query, deduped)
  6. Build prompt (system + regulatory context + document, context-window aware)
  7. LLM call (OpenAI, JSON response format)
  8. Parse + validate response (findings array + summary)
  9. Store result, mark job completed
```

### Error Handling

| Error Type | Behavior |
|-----------|----------|
| `RetryableError` | DB timeouts, embedding API failures, LLM API errors → BullMQ retries with exponential backoff |
| `PermanentError` | Job/document not found, invalid LLM response, terminal job state → moves to failed, no retries |
| Pipeline failure | `markFailed(jobId, errorMessage)` is called before re-throwing |

### Analysis Result Schema

```typescript
interface AnalysisResult {
  findings: Array<{
    clauseRef: string;     // e.g., "DMCC Employment Rule 4.2"
    riskLevel: 'high' | 'medium' | 'low';
    title: string;         // Short issue title
    description: string;   // Detailed compliance gap description
    suggestion: string;    // Concrete recommendation
  }>;
  summary: string;         // Overall compliance assessment (2-4 sentences)
  model: string;           // LLM model used (e.g., "gpt-4o-mini")
  documentChunks: number;  // Number of document chunks processed
  rulesetChunksMatched: number; // Unique regulatory chunks retrieved
  rulesetsConsulted: string[];  // Ruleset keys consulted
}
```

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
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | LLM model for analysis |
| `OPENAI_CHAT_MAX_TOKENS` | `4096` | Max output tokens |
| `OPENAI_CHAT_TEMPERATURE` | `0.1` | LLM temperature (low for deterministic analysis) |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` | Embedding vector dimensions |
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

**Last Updated:** March 4, 2026

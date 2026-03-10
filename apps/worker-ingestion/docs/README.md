# Data Ingestion Worker Documentation

**Status:** Implemented  
**Queue:** `data-ingestion`  
**Port:** 3002 (configurable)

---

## Overview

The Data Ingestion Worker is a standalone NestJS application that consumes jobs from the `data-ingestion` BullMQ queue. It processes rulesets by chunking their clauses, generating embeddings via OpenAI, and storing the resulting vectors in PostgreSQL (pgvector) for later similarity search by the AI Worker.

### What It Does

1. Receives `RULESET_INGESTION` jobs dispatched by the API (e.g., after a new ruleset version is published)
2. Fetches the ruleset version and its JSONB clauses from PostgreSQL
3. Maps clauses to structured `ClauseInput` objects (with validation)
4. Chunks clauses using `ClauseChunkerService` (clause-level chunking with token-aware splitting)
5. Generates embeddings for all chunks (OpenAI `text-embedding-3-small`)
6. Atomic replace: deletes old chunks for the version, inserts new ones in a single transaction
7. Stores chunks with rich metadata (clause ID, title, order, authority name, ruleset key, version)

### Pipeline

```
Ruleset Version → Fetch Clauses → Map + Validate → Chunk (clause-aware) → Embed → Atomic Replace in DB
```

---

## Architecture

### Shared Libraries

| Library | Usage |
|---------|-------|
| `@lib/database` | PostgreSQL connection for reading rulesets and writing chunks |
| `@lib/embedding` | OpenAI embeddings API + clause-level chunking (ClauseChunkerService, TokenCounterService) |
| `@lib/queue` | BullMQ consumer registration (AbstractProcessor) |
| `@lib/redis` | Redis connection for BullMQ |

### Source Structure

```
apps/worker-ingestion/src/
├── main.ts                              # Bootstrap (NestJS)
├── worker-ingestion.module.ts           # Root module
├── worker-ingestion.controller.ts       # Health/status endpoints
├── worker-ingestion.service.ts          # App-level service
├── config/
│   ├── env.schema.ts                    # Joi validation for env vars
│   └── worker-ingestion.config.ts       # ConfigService factory
├── processors/
│   └── data-ingestion.processor.ts      # BullMQ processor (routes by job.name)
├── services/
│   └── ruleset-ingestion.service.ts     # Ingestion pipeline orchestration
└── repositories/
    ├── ruleset-version-read.repository.ts # Read ruleset versions + ruleset metadata
    └── ruleset-chunks.repository.ts       # Delete old chunks, batch insert new ones
```

### Job Flow

```
API dispatches job:
  QueueProducerService.enqueue(DATA_INGESTION, RULESET_INGESTION, { rulesetId, versionId })
                              ↓
DataIngestionProcessor.handle(job)
  → Routes to RulesetIngestionService.ingest(data)
                              ↓
RulesetIngestionService pipeline:
  1. Fetch ruleset version (clauses JSONB) + ruleset metadata (key, authority)
  2. Map JSONB clauses to ClauseInput[] (filter invalid: missing id or empty content)
  3. Chunk clauses (ClauseChunkerService — clause-aware, token-limited)
  4. Generate embeddings (EmbeddingService → OpenAI text-embedding-3-small)
  5. Build insert rows with metadata:
     - clauseId, clauseTitle, clauseOrder
     - isPartial, partIndex, totalParts (for split clauses)
     - tokenCount, authorityName, rulesetKey, version
  6. Atomic transaction: DELETE old chunks for version → INSERT new chunks (batched)
```

### Error Handling

| Error Type | Behavior |
|-----------|----------|
| `RetryableError` | DB errors, embedding API failures → BullMQ retries with exponential backoff |
| `PermanentError` | Ruleset/version not found → moves to failed, no retries |
| Empty clauses | Logs warning, returns early (no error) |

### Chunk Metadata Schema

Each `ruleset_chunks` row includes metadata for traceability:

```json
{
  "clauseId": "clause-uuid",
  "clauseTitle": "Employment Termination",
  "clauseOrder": 4,
  "isPartial": false,
  "tokenCount": 380,
  "authorityName": "DMCC",
  "rulesetKey": "dmcc_employment_rules_v1",
  "version": "1.0.0"
}
```

For clauses that exceed the token limit and are split:

```json
{
  "clauseId": "clause-uuid",
  "clauseTitle": "Long Clause",
  "clauseOrder": 7,
  "isPartial": true,
  "partIndex": 0,
  "totalParts": 3,
  "tokenCount": 512,
  "authorityName": "IFZA",
  "rulesetKey": "ifza_corporate_rules_v1",
  "version": "2.0.0"
}
```

---

## Quick Start

```bash
# Start ingestion worker (from project root)
pnpm start:worker-ingestion

# Start in development mode with hot-reload
pnpm start:worker-ingestion

# Start with debug mode
pnpm start:worker-ingestion:debug

# Build for production
pnpm build:worker-ingestion

# Run production build
pnpm start:worker-ingestion:prod
```

---

## Environment Variables

Create a `.env` file in `apps/worker-ingestion/`:

```bash
cp apps/worker-ingestion/.env.example apps/worker-ingestion/.env
```

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_INGESTION_PORT` | `3002` | HTTP port for health checks |
| `OPENAI_API_KEY` | (required) | OpenAI API key for embeddings |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions (must match pgvector column) |
| `EMBEDDING_CHUNK_SIZE` | `512` | Max tokens per chunk |
| `EMBEDDING_CHUNK_OVERLAP` | `50` | Token overlap between chunks |
| `WORKER_INGESTION_CONCURRENCY` | `10` | Max concurrent jobs |
| `WORKER_INGESTION_BATCH_SIZE` | `500` | DB insert batch size |
| `REDIS_HOST` | `localhost` | Redis host for BullMQ |
| `DB_HOST` | `localhost` | PostgreSQL host |

See `.env.example` for the full list.

---

## Related Documentation

- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture and queue topology
- [Database Schema](../../../docs/DATABASE.md) - `ruleset_chunks` table and pgvector indexes
- [Monorepo Documentation](../../../docs/README.md) - System-wide documentation

---

**Last Updated:** March 4, 2026

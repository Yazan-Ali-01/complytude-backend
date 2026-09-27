# Data Ingestion Worker Documentation

**Status:** Implemented  
**Queue:** `data-ingestion`  
**Port:** 3002 (configurable)

---

## Overview

The Data Ingestion Worker is a standalone NestJS application that consumes jobs from the `data-ingestion` BullMQ queue. It handles two ingestion pipelines:

1. **Ruleset Ingestion** — chunks ruleset clauses, generates embeddings via OpenAI, and stores vectors in PostgreSQL (pgvector) for hybrid retrieval. The `ruleset_chunks` table has a `content_tsv` generated column (tsvector) that is automatically populated by PostgreSQL for BM25 full-text search.
2. **Document Ingestion** — extracts text from uploaded documents (via Textract), stores the extracted content, and promotes the file from the quarantine S3 bucket to the clean bucket.

### Ruleset Ingestion (`RULESET_INGESTION`)

1. Receives jobs dispatched by the API (e.g., after a new ruleset version is published)
2. Fetches the ruleset version and its JSONB clauses from PostgreSQL
3. Maps clauses to structured `ClauseInput` objects (with validation)
4. Chunks clauses using `ClauseChunkerService` (clause-level chunking with token-aware splitting)
5. Generates embeddings for all chunks (OpenAI `text-embedding-3-small`)
6. Atomic replace: deletes old chunks for the version, inserts new ones in a single transaction
7. Stores chunks with rich metadata (clause ID, title, order, authority name, ruleset key, version)

### Document Ingestion (`DOCUMENT_INGESTION`)

1. Receives jobs dispatched by the API after a file upload is confirmed
2. Fetches the document record, validates status (`pending` → `processing`)
3. Calls Textract to extract text from the file in S3 (currently a stub — COM-209)
4. Stores extracted content in the database
5. Promotes the file from quarantine bucket to clean bucket
6. Marks the document as `completed` with the new S3 location
7. On permanent failure or exhausted retries, marks the document as `failed`

**Retry resilience:** If a retry occurs after content was already stored, the Textract step is skipped and the pipeline resumes from S3 promotion.

### Pipelines

```
Ruleset:  Version → Fetch Clauses → Map + Validate → Chunk → Embed → Atomic Replace in DB
Document: Job → Fetch Doc → Validate → Extract Text → Store Content → Promote S3 → Mark Completed
```

---

## Architecture

### Shared Libraries

| Library          | Usage                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `@lib/database`  | PostgreSQL connection for reading rulesets/documents and writing chunks/content           |
| `@lib/embedding` | OpenAI embeddings API + clause-level chunking (ClauseChunkerService, TokenCounterService) |
| `@lib/queue`     | BullMQ consumer registration (AbstractProcessor), job data interfaces                     |
| `@lib/redis`     | Redis connection for BullMQ                                                               |
| `@lib/storage`   | S3 client + basic S3 operations (used by document ingestion pipeline)                     |

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
├── interfaces/
│   ├── textract.interface.ts            # ITextractService interface + DI token
│   └── s3-promotion.interface.ts        # IS3PromotionService interface + DI token
├── services/
│   ├── ruleset-ingestion.service.ts     # Ruleset chunking + embedding pipeline
│   ├── document-ingestion.service.ts    # Document extraction pipeline orchestrator
│   ├── textract.service.ts             # AWS Textract async text extraction (COM-209)
│   └── s3-promotion.service.ts           # S3 file promotion (quarantine → clean bucket)
└── repositories/
    ├── ruleset-version-read.repository.ts # Read ruleset versions + ruleset metadata
    ├── ruleset-chunks.repository.ts       # Delete old chunks, batch insert new ones
    └── document-write.repository.ts       # Read/update document records (platform admin context)
```

### Job Flow

```
DataIngestionProcessor.handle(job) routes by job.name:

── RULESET_INGESTION ──────────────────────────────────────────────
  API: QueueProducerService.enqueue(DATA_INGESTION, RULESET_INGESTION, { rulesetId, versionId })
    → RulesetIngestionService.ingest(data)
    → Fetch version + clauses → Map → Chunk → Embed → Atomic Replace in DB

── DOCUMENT_INGESTION ─────────────────────────────────────────────
  API: QueueProducerService.enqueue(DATA_INGESTION, DOCUMENT_INGESTION, { documentId, tenantId, ... })
    → DocumentIngestionService.process(data)
    → Fetch doc → Validate status → Extract text (Textract) → Store content
    → Promote S3 (quarantine → clean) → Mark completed
    On failure: DataIngestionProcessor.onPermanentFailure/onDeadLetter → markFailed()
```

### Error Handling

| Error Type                 | Behavior                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `RetryableError`           | DB errors, embedding API failures, transient S3 errors → BullMQ retries with exponential backoff   |
| `PermanentError`           | Ruleset/version/document not found, invalid status, empty extraction → moves to failed, no retries |
| Empty clauses (ruleset)    | Logs warning, returns early (no error)                                                             |
| Document permanent failure | `onPermanentFailure` hook marks document as `failed` in DB                                         |
| Document dead letter       | `onDeadLetter` hook marks document as `failed` (retries exhausted)                                 |

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

| Variable                       | Default                  | Description                                    |
| ------------------------------ | ------------------------ | ---------------------------------------------- |
| `WORKER_INGESTION_PORT`        | `3002`                   | HTTP port for health checks                    |
| `OPENAI_API_KEY`               | (required)               | OpenAI API key for embeddings                  |
| `OPENAI_EMBEDDING_MODEL`       | `text-embedding-3-small` | Embedding model                                |
| `OPENAI_EMBEDDING_DIMENSIONS`  | `1536`                   | Vector dimensions (must match pgvector column) |
| `EMBEDDING_CHUNK_SIZE`         | `512`                    | Max tokens per chunk                           |
| `EMBEDDING_CHUNK_OVERLAP`      | `50`                     | Token overlap between chunks                   |
| `WORKER_INGESTION_CONCURRENCY` | `10`                     | Max concurrent jobs                            |
| `WORKER_INGESTION_BATCH_SIZE`  | `500`                    | DB insert batch size                           |
| `REDIS_HOST`                   | `localhost`              | Redis host for BullMQ                          |
| `DB_HOST`                      | `localhost`              | PostgreSQL host                                |
| `S3_ENDPOINT`                  | (empty for AWS S3)       | AWS S3 endpoint                                |
| `S3_REGION`                    | `eu-central-1`           | S3 region                                      |
| `S3_ACCESS_KEY`                | (required)               | AWS access key                                 |
| `S3_SECRET_KEY`                | (required)               | AWS secret key                                 |
| `S3_FORCE_PATH_STYLE`          | `false`                  | Use virtual-hosted style for AWS S3            |
| `COMPLYTUDE_FILES_BUCKET_NAME` | `complytude-files`       | Clean files bucket                             |
| `QUARANTINE_BUCKET_NAME`       | `quarantine`             | Quarantine bucket for uploads                  |

See `.env.example` for the full list.

---

## Related Documentation

- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture and queue topology
- [Database Schema](../../../docs/DATABASE.md) - `ruleset_chunks` table, `documents` table, and pgvector indexes
- [Monorepo Documentation](../../../docs/README.md) - System-wide documentation

---

**Last Updated:** March 25, 2026

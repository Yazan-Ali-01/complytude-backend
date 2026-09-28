# Generation Worker Documentation

**Status:** Implemented (preview and generate)  
**Queue:** `document-generation`  
**Port:** 3003 (configurable)

---

## Overview

The Generation Worker is a standalone NestJS application that consumes jobs from the `document-generation` BullMQ queue. It handles asynchronous document generation from templates, including both preview (DOCX) and full generation (PDF via Gotenberg) workflows.

### What It Does

1. Receives `DOCUMENT_GENERATION` jobs dispatched by the API
2. Loads the template version and DOCX file from S3
3. Renders the DOCX with the provided variables (docxtemplater)
4. For `generate` jobs: converts to PDF via Gotenberg
5. Uploads the result to S3
6. Updates the `generation_jobs` table: `status → completed`, `result_s3_key`

---

## Architecture

### Shared Libraries

| Library | Usage |
|---------|-------|
| `@lib/database` | PostgreSQL connection for reading template data and writing job results |
| `@lib/queue` | BullMQ consumer registration (AbstractProcessor) |
| `@lib/redis` | Redis connection for BullMQ |
| `@lib/storage` | S3 client for reading templates and writing generated documents |

### Source Structure

```
apps/worker-generation/src/
├── main.ts                                    # Bootstrap (NestJS + shutdown hooks)
├── worker-generation.module.ts                # Root module
├── worker-generation.controller.ts            # Health endpoint (GET /health)
├── config/
│   ├── env.schema.ts                          # Joi validation for env vars
│   └── worker-generation.config.ts            # ConfigService factory
├── processors/
│   └── document-generation.processor.ts      # BullMQ processor (routes by job.name)
├── repositories/
│   ├── document-write.repository.ts           # Creates the generated document row
│   └── generation-job-write.repository.ts     # Job status transitions
└── services/
    └── document-generation.service.ts         # Generation orchestration
```

### Job Flow

```
API dispatches job:
  QueueProducerService.enqueue(DOCUMENT_GENERATION, DOCUMENT_GENERATION, { generationJobId, templateId, ... })
                              ↓
DocumentGenerationProcessor.handle(job)
  → Routes to DocumentGenerationWorkerService.generate(data)
                              ↓
DocumentGenerationWorkerService pipeline:
  1. Skip if the job is already completed; claim it (status → processing)
  2. Load the DOCX from S3 (templates/<templateId>/<version>/template.docx)
  3. Render DOCX with variables (docxtemplater)
  4. preview: convert to PDF, watermark, upload to previews/<jobId>.pdf, complete with a signed URL
     generate: convert to PDF, upload to tenants/<tenantId>/documents/<documentId>/contract.pdf,
     then in ONE transaction: insert the document, link it to the job, complete the job
```

**Retries don't duplicate:** a generate job makes exactly one document, whose ID is the generation
job's ID. A retry therefore overwrites the same S3 object and finds the same row
(`INSERT … ON CONFLICT (id) DO NOTHING`), and because insert, link and completion commit together, a
failure part-way leaves nothing behind for the retry to trip over. On the final failed attempt the
worker marks the job failed and queues a `USAGE_REFUND`, which gives the document back to the
tenant's quota.

### Job Payload

```typescript
interface DocumentGenerationJobData {
  generationJobId: string;       // UUID of the generation_jobs record
  templateId: string;            // Template UUID
  templateVersionId: string;     // Specific version to render
  variables: Record<string, unknown>; // Template variable values
  tenantId: string;              // Tenant UUID (for RLS context)
  userId: string;                // User who triggered generation
  jobType: 'preview' | 'generate'; // preview = DOCX only, generate = PDF
}
```

### Error Handling

| Error Type | Behavior |
|-----------|----------|
| `RetryableError` | DB timeouts, S3 failures, Gotenberg errors → BullMQ retries with exponential backoff |
| `PermanentError` | Job/template not found, terminal job state → moves to failed, no retries |

---

## Quick Start

```bash
# Start generation worker (from project root)
pnpm start:worker-generation

# Start in development mode with hot-reload
pnpm start:worker-generation

# Build for production
pnpm build:worker-generation
```

---

## Environment Variables

Create a `.env` file in `apps/worker-generation/`:

```bash
cp apps/worker-generation/.env.example apps/worker-generation/.env
```

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_GENERATION_PORT` | `3003` | HTTP port for health checks |
| `WORKER_GENERATION_CONCURRENCY` | `5` | Max concurrent jobs |
| `REDIS_HOST` | `localhost` | Redis host for BullMQ |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `S3_ENDPOINT` | (empty for AWS S3) | AWS S3 endpoint |

See `.env.example` for the full list.

---

## Related Documentation

- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture and queue topology
- [Database Schema](../../../docs/DATABASE.md) - `generation_jobs` table (migration 021)
- [Monorepo Documentation](../../../docs/README.md) - System-wide documentation
- [COM-229](https://linear.app/complytude/issue/COM-229) - Full generation processor implementation

---

**Last Updated:** March 29, 2026

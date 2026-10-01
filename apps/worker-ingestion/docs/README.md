# Data Ingestion Worker Documentation

**Status:** Implemented  
**Queue:** `data-ingestion`  
**Port:** 3002 (configurable)

---

## Overview

The Data Ingestion Worker is a standalone NestJS application that consumes jobs from the `data-ingestion` BullMQ queue. It handles two ingestion pipelines:

1. **Ruleset Ingestion** — chunks ruleset clauses, generates embeddings via OpenAI, and stores vectors in PostgreSQL (pgvector) for hybrid retrieval. The `ruleset_chunks` table has a `content_tsv` generated column (tsvector) that is automatically populated by PostgreSQL for BM25 full-text search.
2. **Document Ingestion** — extracts text from uploaded documents (a PDF's own text layer, read locally; Azure AI Document Intelligence only for scanned pages), stores the extracted content, and promotes the file from the quarantine S3 bucket to the clean bucket.

### Ruleset Ingestion (`RULESET_INGESTION`)

1. Receives jobs dispatched by the API (e.g., after a new ruleset version is published)
2. Fetches the ruleset version and its JSONB clauses from PostgreSQL
3. Maps clauses to structured `ClauseInput` objects (with validation)
4. Chunks clauses using `ClauseChunkerService` (clause-level chunking with token-aware splitting)
5. Generates embeddings for all chunks (OpenAI `text-embedding-3-large` at 1536 dimensions) and records the model on each chunk (`embedding_model`)
6. Atomic replace: deletes old chunks for the version, inserts new ones in a single transaction
7. Stores chunks with rich metadata (clause ID, title, order, whether it's required, severity, article, section, source, authority name, ruleset key and name, version)

### Document Ingestion (`DOCUMENT_INGESTION`)

1. Receives jobs dispatched by the API after a file upload is confirmed
2. Fetches the document record in the job's tenant (RLS: a document of another tenant is not found and the job fails), validates status (`pending` → `processing`), and refuses a job whose bucket, key or MIME type differ from the row's; extraction and promotion then use the row's file, never the payload's
3. Extracts text (see [Text extraction](#text-extraction)): a PDF over `DOCUMENT_MAX_PAGES`, or unreadable, or a file that isn't a PDF, fails for good first. A born-digital PDF is read locally and never leaves the worker; only scanned pages go to Document Intelligence (`prebuilt-layout`), as a PDF of just those pages
4. Stores the extracted content (`content`, `content_structured`) and the pages OCR read (`ocr_pages`) in the database
5. Promotes the file from quarantine bucket to clean bucket, once GuardDuty Malware Protection has tagged it clean (`GuardDutyMalwareScanStatus=NO_THREATS_FOUND`) when `MALWARE_SCAN_REQUIRED` (always in production). Not scanned yet: the job waits up to `MALWARE_SCAN_WAIT_MS`, then retries. Any other result (threats found, or a file the scanner could not read) fails the document for good; the file stays in quarantine, which the API never hands out, and expires with it
6. Marks the document as `completed` with the new S3 location
7. On permanent failure or exhausted retries, marks the document as `failed`

**Retry resilience:** If a retry occurs after content was already stored, extraction is skipped and the pipeline resumes from S3 promotion. A retry before that (poll timeout, crash, stall) resumes polling the stored Document Intelligence analysis (`documents.ocr_operation_id`, with the pages it reads in `ocr_pages`) instead of starting, and paying for, another; only an analysis that itself failed, or whose result is gone (kept 24 hours), is replaced.

**Page limit:** `DOCUMENT_MAX_PAGES` caps every document, read locally or not: by the API at `confirm-upload` (400, the document stays pending) and again here before the file is parsed.

### Text extraction

| Upload | What reads it |
| --- | --- |
| PDF with a text layer on every page (exported from Word, a contract generator) | pdf.js, in the worker. **No OCR call.** |
| PDF with some scanned pages | pdf.js for the text pages; Document Intelligence for the scanned pages only |
| Scanned PDF, or a PDF whose text layer holds no text (text drawn as outlines) | Document Intelligence, every page |

Only PDFs are uploaded (the API issues upload URLs for `application/pdf` only); anything else fails for good.

- **Scanned page:** fewer than `PDF_TEXT_MIN_CHARS_PER_PAGE` letters and digits in its text layer, and at least one image on the page (read from the page's resources with pdf-lib; nothing is decoded). A nearly empty page without an image is a blank page, not a scan.
- **OCR:** the scanned pages are copied into a new PDF in memory and sent as bytes (`base64Source`) to Azure AI Document Intelligence, REST API `2024-11-30`, model `prebuilt-layout` (reads printed Arabic and English), at `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` (the resource is in UAE North). Nothing is written to storage for it. Once the result is read it is deleted at the service (`DELETE …/analyzeResults/{id}`); one that can't be deleted expires there after 24 hours. Paragraph roles map to the same layout items as local pages: `title` and `sectionHeading` start sections, `pageHeader`, `pageFooter` and `pageNumber` are dropped; without paragraphs, each page's lines are one paragraph.
- **Errors:** a document the service refuses (HTTP 400, 413, 415) fails for good; 401/403, 429, 5xx and network errors are retried; an analysis that failed, or a result that's gone (404), is cleared so the retry starts a new one.
- **Merge:** OCR numbers the pages of the copy; they are mapped back to the document's pages and merged with the locally read pages in page order.
- **Structure:** local pages produce the same `content_structured` as OCR's layout (`document-layout.ts`): runs → lines (right-to-left lines read from the right; a page with two side-by-side columns, as bilingual English/Arabic contracts have, is read one column at a time, English first) → paragraphs (line spacing, list markers) → headings (larger than the body text, or a short line that reads as one: `ARTICLE 5`, `المادة 6`, `1.4 Bearer Share Certificates`, a line in capitals) → sections. Page numbers and running headers and footers are dropped. On the demo contract (`data/test-documents/dmcc_test_shareholders_agreement.pdf`) the sections match the headings of its source document exactly (`document-ingestion.service.spec.ts`).
- **Record:** `documents.ocr_pages` lists the pages whose text came from OCR: `{}` when none did (nothing left the worker).
- **Live check:** `pnpm test:ocr-live` sends one scanned Arabic page (`data/test-documents/arabic_scanned_page.png`) to the resource in `apps/worker-ingestion/.env` and checks the text, a heading and the deletion (one billed page). Skipped in the normal test run.
- **pdf.js** (`pdfjs-dist`, legacy build) runs with no font loading, XFA or WebAssembly, and only reads text. It ships only as an ES module and is loaded through Node's `require` (Node 22.12+), at boot, so a missing package fails the image's smoke test. Its optional native canvas package is removed (`pnpm.overrides`), so it logs three `Warning: Cannot polyfill …` lines at boot: expected, nothing is rendered.

### Pipelines

```
Ruleset:  Version → Fetch Clauses → Map + Validate → Chunk → Embed → Atomic Replace in DB
Document: Job → Fetch Doc → Validate → Read text layer (+ OCR scanned pages) → Store Content → Promote S3 → Mark Completed
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
| `@lib/pdf`       | Page count, pages with images, copying pages into a new PDF (pdf-lib)                     |

### Source Structure

```
apps/worker-ingestion/src/
├── main.ts                              # Bootstrap (NestJS)
├── worker-ingestion.module.ts           # Root module
├── worker-ingestion.controller.ts       # Health/status endpoints
├── worker-ingestion.service.ts          # App-level service
├── config/
│   ├── env.schema.ts                    # Joi validation for env vars
│   ├── ocr.config.ts                    # OCR endpoint, key, page cap, polling
│   └── worker-ingestion.config.ts       # ConfigService factory
├── processors/
│   └── data-ingestion.processor.ts      # BullMQ processor (routes by job.name)
├── interfaces/
│   ├── ocr.interface.ts                 # IOcrService interface + DI tokens
│   └── s3-promotion.interface.ts        # IS3PromotionService interface + DI token
├── services/
│   ├── ruleset-ingestion.service.ts     # Ruleset chunking + embedding pipeline
│   ├── document-ingestion.service.ts    # Document extraction pipeline orchestrator
│   ├── pdf-text-layer.ts                # Local text layer (pdf.js) → lines, paragraphs, headings
│   ├── document-layout.ts               # Layout items → sections + flat text (local and OCR)
│   ├── document-intelligence.client.ts  # Azure AI Document Intelligence REST calls (analyze, result, delete)
│   ├── document-intelligence.service.ts # OCR of scanned pages: poll, parse the layout, delete the result
│   └── s3-promotion.service.ts           # S3 file promotion (quarantine → clean bucket)
└── repositories/
    ├── ruleset-version-read.repository.ts # Read ruleset versions + ruleset metadata
    ├── ruleset-chunks.repository.ts       # Delete old chunks, batch insert new ones
    └── document-write.repository.ts       # Read/update document records (job's tenant context)
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
    → Fetch doc → Validate status → Extract text (text layer; Document Intelligence for scanned pages) → Store content
    → Require a clean malware scan → Promote S3 (quarantine → clean) → Mark completed
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
| Scan refund                | Marking a document `failed` gives the tenant its document scan back: a `USAGE_REFUND` job on `entitlement-processing` (job id `usage-refund-scan-<documentId>`). A document already `completed` is never marked failed, so a late failure of a retried job refunds nothing |

### Chunk Metadata Schema

Each `ruleset_chunks` row includes metadata for traceability:

```json
{
  "clauseId": "dmcc_emp_05",
  "clauseTitle": "Termination Notice – DMCC Specifics",
  "clauseOrder": 5,
  "isRequired": true,
  "severity": "high",
  "article": "Art. 12",
  "section": null,
  "source": null,
  "isPartial": false,
  "tokenCount": 380,
  "authorityName": "Dubai Multi Commodities Centre",
  "rulesetKey": "dmcc_employment_regulations_v1",
  "rulesetName": "DMCC Employment Regulations",
  "version": "1.0.0"
}
```

`isRequired` comes from the clause's `is_required`; `severity`, `article`, `section` and `source` (`source_document`) from its `metadata`, `null` when absent. worker-ai builds each finding's citation and baseline severity from them.

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
| `OPENAI_BASE_URL`              | `https://api.openai.com/v1` | OpenAI host: the global API or a data-residency host (`us`/`eu`/`ae`); must match worker-ai's |
| `OPENAI_EMBEDDING_MODEL`       | `text-embedding-3-large` | Embedding model; must match worker-ai's (a change means `pnpm rulesets:reingest`) |
| `OPENAI_EMBEDDING_DIMENSIONS`  | `1536`                   | Vector dimensions (must match pgvector column) |
| `EMBEDDING_CHUNK_SIZE`         | `512`                    | Max tokens per chunk                           |
| `EMBEDDING_CHUNK_OVERLAP`      | `50`                     | Token overlap between chunks                   |
| `WORKER_INGESTION_CONCURRENCY` | `10`                     | Max concurrent jobs                            |
| `WORKER_INGESTION_BATCH_SIZE`  | `500`                    | DB insert batch size                           |
| `DOCUMENT_MAX_PAGES`           | `50`                     | Most pages a PDF may have (checked before it is read; keep equal to the API's) |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | (required in production) | `https://<resource>.cognitiveservices.azure.com/` |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | (required in production, secret) | KEY 1 or KEY 2 of the resource; without it locally, a scanned page fails its document |
| `OCR_POLL_INITIAL_DELAY_MS` / `OCR_POLL_MAX_DELAY_MS` / `OCR_POLL_MAX_ATTEMPTS` / `OCR_POLL_BACKOFF_MULTIPLIER` | `2000` / `30000` / `60` / `1.5` | Polling of an analysis |
| `PDF_TEXT_MIN_CHARS_PER_PAGE`  | `50`                     | A PDF page with fewer letters and digits in its text layer, and an image, is OCRed |
| `REDIS_HOST`                   | `localhost`              | Redis host for BullMQ                          |
| `DB_HOST`                      | `localhost`              | PostgreSQL host                                |
| `S3_ENDPOINT`                  | (empty for AWS S3)       | AWS S3 endpoint                                |
| `S3_REGION`                    | `eu-central-1`           | S3 region                                      |
| `S3_ACCESS_KEY`                | (required)               | AWS access key                                 |
| `S3_SECRET_KEY`                | (required)               | AWS secret key                                 |
| `S3_FORCE_PATH_STYLE`          | `false`                  | Use virtual-hosted style for AWS S3            |
| `COMPLYTUDE_FILES_BUCKET_NAME` | `complytude-files`       | Clean files bucket                             |
| `QUARANTINE_BUCKET_NAME`       | `quarantine`             | Quarantine bucket for uploads                  |
| `MALWARE_SCAN_REQUIRED`        | `false` (`true` in production, required) | Promote only uploads GuardDuty tagged clean |
| `MALWARE_SCAN_WAIT_MS`         | `60000`                  | How long one attempt waits for the scan result |

See `.env.example` for the full list.

---

## Related Documentation

- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture and queue topology
- [Database Schema](../../../docs/DATABASE.md) - `ruleset_chunks` table, `documents` table, and pgvector indexes
- [Monorepo Documentation](../../../docs/README.md) - System-wide documentation

---

**Last Updated:** September 30, 2026

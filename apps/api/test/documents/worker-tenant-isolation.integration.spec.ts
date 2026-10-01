import { TextChunkerService, TokenCounterService } from '@lib/embedding';
import type { EmbeddingService } from '@lib/embedding';
import { pdfWith } from '@lib/pdf/testing/pdf-fixtures';
import { PermanentError, type QueueProducerService } from '@lib/queue';
import type { S3Service } from '@lib/storage';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AnalysisJobWriteRepository } from '../../../worker-ai/src/repositories/analysis-job-write.repository';
import { DocumentReadRepository } from '../../../worker-ai/src/repositories/document-read.repository';
import type { RulesetChunkSearchRepository } from '../../../worker-ai/src/repositories/ruleset-chunk-search.repository';
import { RedactionService } from '../../../worker-ai/src/redaction/redaction.service';
import { DocumentAnalysisService } from '../../../worker-ai/src/services/document-analysis.service';
import type { LlmService } from '../../../worker-ai/src/services/llm.service';
import { PromptBuilderService } from '../../../worker-ai/src/services/prompt-builder.service';
import type { IS3PromotionService } from '../../../worker-ingestion/src/interfaces/s3-promotion.interface';
import type { IOcrService } from '../../../worker-ingestion/src/interfaces/ocr.interface';
import { DocumentWriteRepository } from '../../../worker-ingestion/src/repositories/document-write.repository';
import { DocumentIngestionService } from '../../../worker-ingestion/src/services/document-ingestion.service';
import { createTestTenant } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const QUARANTINE = 'test-quarantine';

/**
 * The analysis and ingestion workers, as the app role under RLS, given jobs whose payload names
 * a tenant that doesn't own the document: they fail for good without reading or changing it.
 * (Generation: see document-generation.integration.spec.ts.)
 */
describe('Workers act only inside the job payload tenant', () => {
  let app: TestApp;
  let victim: string;
  let attacker: string;
  /** Refund jobs the workers enqueued (USAGE_REFUND). */
  let refundsEnqueued: unknown[];
  const refundProducer = {
    enqueue: (_queue: string, _name: string, data: unknown) => {
      refundsEnqueued.push(data);
      return Promise.resolve();
    },
  } as unknown as QueueProducerService;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    refundsEnqueued = [];
    victim = (await createTestTenant(app.module)).id;
    attacker = (await createTestTenant(app.module)).id;
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function document(
    tenantId: string,
    fields: { content?: string; extractionStatus?: string } = {},
  ): Promise<{ id: string; s3Key: string }> {
    const s3Key = `tenants/${tenantId}/documents/${randomUUID()}/contract.pdf`;
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.documents
         (tenant_id, title, source_type, s3_key, s3_bucket, mime_type, content, extraction_status)
       VALUES ($1, 'Secret contract', 'file_upload', $2, $3, 'application/pdf', $4, $5)
       RETURNING id`,
      [
        tenantId,
        s3Key,
        QUARANTINE,
        fields.content ?? null,
        fields.extractionStatus ?? 'processing',
      ],
    );
    return { id: rows[0].id, s3Key };
  }

  async function analysisJob(
    tenantId: string,
    documentId: string,
  ): Promise<string> {
    const { rows } = await app.databaseService.query<{ id: string }>(
      `INSERT INTO public.analysis_jobs (tenant_id, document_id) VALUES ($1, $2) RETURNING id`,
      [tenantId, documentId],
    );
    return rows[0].id;
  }

  async function row(
    table: 'analysis_jobs' | 'documents',
    id: string,
  ): Promise<Record<string, unknown>> {
    const { rows } = await app.databaseService.query<Record<string, unknown>>(
      `SELECT * FROM public.${table} WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  describe('analysis (worker-ai)', () => {
    let modelCalls: number;

    function analysisWorker(): DocumentAnalysisService {
      modelCalls = 0;
      const llm = {
        getContextWindowTokens: () => 128_000,
        getMaxOutputTokens: () => 4_096,
        getTokenEncoding: () => 'o200k_base',
        getModel: () => 'test-model',
        getBaseUrl: () => 'https://api.openai.com/v1',
        chatCompletion: () => {
          modelCalls++;
          return Promise.resolve({
            data: { findings: [], summary: 'ok' },
            usage: { promptTokens: 0, completionTokens: 0 },
          });
        },
      } as unknown as LlmService;
      const tokenCounter = new TokenCounterService();
      return new DocumentAnalysisService(
        new AnalysisJobWriteRepository(app.appDatabaseService),
        new DocumentReadRepository(app.appDatabaseService),
        {
          hybridSearchBatch: () => Promise.resolve([]),
          findRequiredClauses: () => Promise.resolve([]),
          findEmbeddings: () => Promise.resolve(new Map()),
        } as unknown as RulesetChunkSearchRepository,
        new TextChunkerService(tokenCounter),
        {
          generateEmbeddings: (texts: string[]) =>
            Promise.resolve(texts.map(() => ({ embedding: [0] }))),
        } as unknown as EmbeddingService,
        new PromptBuilderService(tokenCounter, llm),
        llm,
        new RedactionService({
          get: (_key: string, fallback: unknown) => fallback,
        } as ConfigService),
        { get: (_key: string, fallback: unknown) => fallback } as ConfigService,
        refundProducer,
      );
    }

    it("refuses a job whose tenantId doesn't own it, leaving the victim's job untouched", async () => {
      const doc = await document(victim, { content: 'Secret terms' });
      const jobId = await analysisJob(victim, doc.id);

      await expect(
        analysisWorker().analyze({
          analysisJobId: jobId,
          documentId: doc.id,
          tenantId: attacker,
        }),
      ).rejects.toThrow(PermanentError);

      expect(modelCalls).toBe(0);
      // Refused before the worker claimed it: nothing to refund
      expect(refundsEnqueued).toEqual([]);
      expect(await row('analysis_jobs', jobId)).toMatchObject({
        status: 'queued',
        result: null,
      });
    });

    it("refuses an own job whose payload names another tenant's document", async () => {
      const secret = await document(victim, { content: 'Secret terms' });
      const own = await document(attacker, { content: 'Own contract' });
      const jobId = await analysisJob(attacker, own.id);

      await expect(
        analysisWorker().analyze({
          analysisJobId: jobId,
          documentId: secret.id,
          tenantId: attacker,
        }),
      ).rejects.toThrow(PermanentError);

      expect(modelCalls).toBe(0);
      expect((await row('analysis_jobs', jobId)).status).toBe('queued');
    });

    it("never reads another tenant's document, even when the job row points at it", async () => {
      const secret = await document(victim, { content: 'Secret terms' });
      // A job row that references another tenant's document (only possible through a bug)
      const jobId = await analysisJob(attacker, secret.id);

      await expect(
        analysisWorker().analyze(
          { analysisJobId: jobId, documentId: secret.id, tenantId: attacker },
          3,
          3,
        ),
      ).rejects.toThrow(/not found/);

      expect(modelCalls).toBe(0);
      expect(await row('analysis_jobs', jobId)).toMatchObject({
        status: 'failed',
        result: null,
      });
    });
  });

  describe('ingestion (worker-ingestion)', () => {
    let startOcr: jest.Mock;
    let promote: jest.Mock;
    let getObjectBuffer: jest.Mock;
    let ingestion: DocumentIngestionService;

    beforeEach(async () => {
      startOcr = jest.fn().mockResolvedValue('ocr-operation');
      promote = jest.fn().mockResolvedValue({ bucket: 'clean', key: 'k' });
      const pdf = Buffer.from(
        await pdfWith([
          ['The Employee shall work forty-eight hours a week in Dubai.'],
        ]),
      );
      getObjectBuffer = jest.fn().mockResolvedValue(pdf);
      const ocr: IOcrService = {
        start: startOcr,
        collect: jest.fn().mockResolvedValue({ items: [], pageCount: 1 }),
      };
      const promotion: IS3PromotionService = { promote };
      ingestion = new DocumentIngestionService(
        new DocumentWriteRepository(app.appDatabaseService),
        ocr,
        promotion,
        { getObjectBuffer } as unknown as S3Service,
        new ConfigService({
          ocr: { maxPages: 50, minTextCharsPerPage: 50 },
        }),
        refundProducer,
      );
    });

    it("refuses a job whose tenantId doesn't own the document, before reading its file", async () => {
      const doc = await document(victim);
      const payload = {
        documentId: doc.id,
        tenantId: attacker,
        s3Bucket: QUARANTINE,
        s3Key: doc.s3Key,
        originalFilename: 'contract.pdf',
        mimeType: 'application/pdf',
      };

      await expect(ingestion.process(payload)).rejects.toThrow(/not found/);
      // What the processor does after a permanent failure: it can't touch the victim's row either
      await ingestion.markFailed(attacker, doc.id, 'forged');
      expect(refundsEnqueued).toEqual([]);

      expect(getObjectBuffer).not.toHaveBeenCalled();
      expect(startOcr).not.toHaveBeenCalled();
      expect(promote).not.toHaveBeenCalled();
      expect(await row('documents', doc.id)).toMatchObject({
        extraction_status: 'processing',
        extraction_error: null,
        content: null,
      });
    });

    it("refuses a job whose file differs from the document's, and reads only the row's file", async () => {
      const doc = await document(victim);
      const payload = {
        documentId: doc.id,
        tenantId: victim,
        s3Bucket: QUARANTINE,
        s3Key: `tenants/${attacker}/documents/x/other.pdf`,
        originalFilename: 'contract.pdf',
        mimeType: 'application/pdf',
      };

      await expect(ingestion.process(payload)).rejects.toThrow(PermanentError);
      expect(getObjectBuffer).not.toHaveBeenCalled();

      await ingestion.process({ ...payload, s3Key: doc.s3Key });
      expect(getObjectBuffer).toHaveBeenCalledWith(QUARANTINE, doc.s3Key);
      // A born-digital PDF is read locally: no OCR processor sees it
      expect(startOcr).not.toHaveBeenCalled();
      expect(await row('documents', doc.id)).toMatchObject({
        extraction_status: 'completed',
        content: 'The Employee shall work forty-eight hours a week in Dubai.',
        ocr_pages: [],
      });
    });
  });
});

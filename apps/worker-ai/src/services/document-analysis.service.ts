import { EmbeddingService, TextChunkerService } from '@lib/embedding';
import type { DocumentAnalysisJobData } from '@lib/queue';
import { PermanentError, RetryableError } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { AnalysisResult } from '../interfaces/analysis-result.interface';
import { AnalysisJobWriteRepository } from '../repositories/analysis-job-write.repository';
import { DocumentReadRepository } from '../repositories/document-read.repository';
import {
  RulesetChunkMatch,
  RulesetChunkSearchRepository,
} from '../repositories/ruleset-chunk-search.repository';
import { LlmService } from './llm.service';
import { PromptBuilderService } from './prompt-builder.service';

const TOP_K_PER_QUERY = 5;
const MAX_UNIQUE_CHUNKS = 20;

@Injectable()
export class DocumentAnalysisService {
  private readonly logger = new Logger(DocumentAnalysisService.name);

  constructor(
    private readonly analysisJobWriteRepository: AnalysisJobWriteRepository,
    private readonly documentReadRepository: DocumentReadRepository,
    private readonly rulesetChunkSearchRepository: RulesetChunkSearchRepository,
    private readonly textChunkerService: TextChunkerService,
    private readonly embeddingService: EmbeddingService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly llmService: LlmService,
  ) {}

  async analyze(data: DocumentAnalysisJobData): Promise<void> {
    const { analysisJobId, documentId } = data;

    // Step 1: Verify the analysis job exists
    const job = await this.analysisJobWriteRepository
      .findById(analysisJobId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error fetching analysis job ${analysisJobId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!job) {
      throw new PermanentError(
        `Analysis job ${analysisJobId} not found — skipping`,
      );
    }

    if (job.status !== 'queued' && job.status !== 'processing') {
      throw new PermanentError(
        `Analysis job ${analysisJobId} is in terminal state '${job.status}' — skipping re-run`,
      );
    }

    // Step 2: Atomically claim the job — guards against a concurrent worker on the same job
    const claimed = await this.analysisJobWriteRepository
      .markProcessing(analysisJobId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error marking job ${analysisJobId} as processing`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!claimed) {
      throw new PermanentError(
        `Analysis job ${analysisJobId} was claimed by another worker — skipping`,
      );
    }

    // Wrap remaining work so failures update status to 'failed'
    const pipelineStart = Date.now();
    try {
      await this.runPipeline(analysisJobId, documentId);
      this.logger.log(
        `Pipeline completed in ${Date.now() - pipelineStart}ms for job=${analysisJobId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.analysisJobWriteRepository
        .markFailed(analysisJobId, message)
        .catch((dbErr: unknown) => {
          this.logger.error(
            `Failed to mark job ${analysisJobId} as failed after pipeline error: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
          );
        });

      throw error;
    }
  }

  private async runPipeline(
    analysisJobId: string,
    documentId: string,
  ): Promise<void> {
    // Step 3: Fetch document content
    const document = await this.documentReadRepository
      .findContentById(documentId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error fetching document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!document) {
      throw new PermanentError(
        `Document ${documentId} not found — cannot analyze`,
      );
    }

    if (!document.content?.trim()) {
      throw new PermanentError(
        `Document ${documentId} has no content — cannot analyze`,
      );
    }

    this.logger.log(
      `Starting RAG pipeline for job=${analysisJobId} document="${document.title}"`,
    );

    // Step 4: Chunk the document text
    const documentChunks = this.textChunkerService.chunk(document.content);

    this.logger.log(`Document chunked into ${documentChunks.length} chunks`);

    // Step 5: Embed all document chunks
    const chunkTexts = documentChunks.map((c) => c.content);
    this.logger.log(
      `Embedding ${chunkTexts.length} document chunks for job=${analysisJobId}`,
    );
    const embeddings = await this.embeddingService
      .generateEmbeddings(chunkTexts)
      .catch((err: unknown) => {
        throw new RetryableError(
          `Embedding API error for document ${documentId}`,
          err instanceof Error ? err : undefined,
        );
      });

    // Steps 6–8: Batch similarity search, deduplicate, rank (single DB round-trip)
    const topChunks = await this.rulesetChunkSearchRepository
      .searchSimilarBatch(
        embeddings.map((e) => e.embedding),
        TOP_K_PER_QUERY,
        MAX_UNIQUE_CHUNKS,
      )
      .catch((err: unknown) => {
        throw new RetryableError(
          'pgvector similarity search error',
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Retrieved ${topChunks.length} unique ruleset chunks via similarity search`,
    );

    // Step 9: Build prompt
    const { systemPrompt, userMessage, wasDocumentTruncated } =
      this.promptBuilderService.buildPrompt(
        document.title,
        document.content,
        topChunks,
      );

    if (wasDocumentTruncated) {
      this.logger.warn(
        `Document "${document.title}" was truncated to fit context window`,
      );
    }

    // Step 10: Call LLM
    const rawResponse = await this.llmService
      .chatCompletion({ systemPrompt, userMessage })
      .catch((err: unknown) => {
        throw new RetryableError(
          `LLM API error for job ${analysisJobId}`,
          err instanceof Error ? err : undefined,
        );
      });

    // Step 11: Parse and validate LLM response
    const parsedResult = this.parseAndValidateLlmResponse(
      rawResponse,
      analysisJobId,
    );

    // Step 12: Build final result with metadata
    const rulesetsConsulted = this.extractRulesetsConsulted(topChunks);

    const result: AnalysisResult = {
      findings: parsedResult.findings,
      summary: parsedResult.summary,
      model: this.llmService.getModel(),
      documentChunks: documentChunks.length,
      rulesetChunksMatched: topChunks.length,
      rulesetsConsulted,
    };

    // Step 13: Store result and mark completed
    await this.analysisJobWriteRepository
      .markCompleted(analysisJobId, result)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error storing result for job ${analysisJobId}`,
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Analysis complete for job=${analysisJobId}: ${result.findings.length} findings, ` +
        `${result.rulesetsConsulted.length} rulesets consulted`,
    );
  }

  private parseAndValidateLlmResponse(
    raw: unknown,
    jobId: string,
  ): { findings: AnalysisResult['findings']; summary: string } {
    if (typeof raw !== 'object' || raw === null) {
      throw new PermanentError(
        `LLM response for job ${jobId} is not a JSON object`,
      );
    }

    const obj = raw as Record<string, unknown>;

    if (!Array.isArray(obj.findings)) {
      throw new PermanentError(
        `LLM response for job ${jobId} missing 'findings' array`,
      );
    }

    if (typeof obj.summary !== 'string' || !obj.summary.trim()) {
      throw new PermanentError(
        `LLM response for job ${jobId} missing 'summary' string`,
      );
    }

    const findings = obj.findings.map((f: unknown, i: number) => {
      if (typeof f !== 'object' || f === null) {
        throw new PermanentError(
          `LLM response job ${jobId}: finding[${i}] is not an object`,
        );
      }
      const finding = f as Record<string, unknown>;

      for (const field of [
        'clauseRef',
        'riskLevel',
        'title',
        'description',
        'suggestion',
      ] as const) {
        if (
          typeof finding[field] !== 'string' ||
          !String(finding[field]).trim()
        ) {
          throw new PermanentError(
            `LLM response job ${jobId}: finding[${i}].${field} is missing or empty`,
          );
        }
      }

      const riskLevel = finding.riskLevel as string;
      if (!['high', 'medium', 'low'].includes(riskLevel)) {
        throw new PermanentError(
          `LLM response job ${jobId}: finding[${i}].riskLevel is '${riskLevel}', expected high|medium|low`,
        );
      }

      return {
        clauseRef: finding.clauseRef as string,
        riskLevel: riskLevel as AnalysisResult['findings'][0]['riskLevel'],
        title: finding.title as string,
        description: finding.description as string,
        suggestion: finding.suggestion as string,
      };
    });

    return { findings, summary: obj.summary };
  }

  private extractRulesetsConsulted(chunks: RulesetChunkMatch[]): string[] {
    const keys = new Set<string>();
    for (const chunk of chunks) {
      const key = chunk.metadata.rulesetKey;
      if (typeof key === 'string' && key.trim()) {
        keys.add(key.trim());
      }
    }

    if (chunks.length > 0 && keys.size === 0) {
      this.logger.warn(
        `${chunks.length} ruleset chunks matched but none carried 'rulesetKey' in metadata — ` +
          `rulesetsConsulted will be empty. Check worker-ingestion metadata schema.`,
      );
    }

    return Array.from(keys);
  }
}

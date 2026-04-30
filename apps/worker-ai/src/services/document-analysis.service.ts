import { EmbeddingService, TextChunkerService } from '@lib/embedding';
import type { DocumentAnalysisJobData } from '@lib/queue';
import { PermanentError, RetryableError } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';
import {
  AnalysisFinding,
  AnalysisResult,
} from '../interfaces/analysis-result.interface';
import { AnalysisJobWriteRepository } from '../repositories/analysis-job-write.repository';
import { DocumentReadRepository } from '../repositories/document-read.repository';
import {
  RulesetChunkMatch,
  RulesetChunkSearchRepository,
} from '../repositories/ruleset-chunk-search.repository';
import { LlmService } from './llm.service';
import { PromptBuilderService } from './prompt-builder.service';
import { RerankerService } from './reranker.service';

const ANALYSIS_RESULT_SCHEMA: ResponseFormatJSONSchema.JSONSchema = {
  name: 'analysis_result',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clauseRef: { type: 'string' },
            riskLevel: { type: 'string', enum: ['high', 'medium', 'low'] },
            title: { type: 'string' },
            description: { type: 'string' },
            suggestion: { type: 'string' },
          },
          required: [
            'clauseRef',
            'riskLevel',
            'title',
            'description',
            'suggestion',
          ],
          additionalProperties: false,
        },
      },
      summary: { type: 'string' },
    },
    required: ['findings', 'summary'],
    additionalProperties: false,
  },
};

@Injectable()
export class DocumentAnalysisService {
  private readonly logger = new Logger(DocumentAnalysisService.name);

  private readonly topKPerQuery: number;
  private readonly vectorLimit: number;
  private readonly bm25Limit: number;
  private readonly maxHybridResults: number;

  constructor(
    private readonly analysisJobWriteRepository: AnalysisJobWriteRepository,
    private readonly documentReadRepository: DocumentReadRepository,
    private readonly rulesetChunkSearchRepository: RulesetChunkSearchRepository,
    private readonly textChunkerService: TextChunkerService,
    private readonly embeddingService: EmbeddingService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly llmService: LlmService,
    private readonly rerankerService: RerankerService,
    configService: ConfigService,
  ) {
    this.topKPerQuery = configService.get<number>(
      'workerAi.ragTopKPerQuery',
      5,
    );
    this.vectorLimit = configService.get<number>('workerAi.ragVectorLimit', 30);
    this.bm25Limit = configService.get<number>('workerAi.ragBm25Limit', 30);
    this.maxHybridResults = configService.get<number>(
      'workerAi.ragMaxHybridResults',
      40,
    );
  }

  async analyze(data: DocumentAnalysisJobData): Promise<void> {
    const { analysisJobId, documentId } = data;
    const rulesetIds: string[] | undefined = Array.isArray(data.rulesetIds)
      ? data.rulesetIds
      : undefined;

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

    const pipelineStart = Date.now();
    try {
      await this.runPipeline(analysisJobId, documentId, rulesetIds);
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
    rulesetIds?: string[],
  ): Promise<void> {
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

    const scoped = rulesetIds && rulesetIds.length > 0;
    this.logger.log(
      `Starting RAG pipeline for job=${analysisJobId} document="${document.title}"` +
        (scoped ? ` scoped to ${rulesetIds.length} rulesets` : ' (global)'),
    );

    // Chunk the document text
    const documentChunks = this.textChunkerService.chunk(document.content);
    this.logger.log(`Document chunked into ${documentChunks.length} chunks`);

    // Embed all document chunks
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

    // Hybrid search: vector similarity + BM25 full-text, merged via RRF
    const bm25Query = this.buildBm25Query(document.title, chunkTexts);
    const topChunks = await this.rulesetChunkSearchRepository
      .hybridSearchBatch(
        embeddings.map((e) => e.embedding),
        bm25Query,
        this.topKPerQuery,
        this.vectorLimit,
        this.bm25Limit,
        this.maxHybridResults,
        rulesetIds,
      )
      .catch((err: unknown) => {
        throw new RetryableError(
          'Hybrid search (vector + BM25) error',
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Retrieved ${topChunks.length} chunks via hybrid search (vector + BM25)`,
    );

    // Re-rank via Cohere
    const rerankQuery =
      `${document.title} ${chunkTexts.slice(0, 2).join(' ')}`.slice(0, 500);
    const { chunks: rerankedChunks, reranked } =
      await this.rerankerService.rerank(rerankQuery, topChunks);

    this.logger.log(
      `After rerank: ${rerankedChunks.length} chunks (reranked=${reranked})`,
    );

    // Build prompt
    const { systemPrompt, userMessage, wasDocumentTruncated } =
      this.promptBuilderService.buildPrompt(
        document.title,
        document.content,
        rerankedChunks,
      );

    if (wasDocumentTruncated) {
      this.logger.warn(
        `Document "${document.title}" was truncated to fit context window`,
      );
    }

    // Call LLM with structured output enforcement
    const rawResponse = await this.llmService
      .chatCompletion({
        systemPrompt,
        userMessage,
        responseSchema: ANALYSIS_RESULT_SCHEMA,
      })
      .catch((err: unknown) => {
        throw new RetryableError(
          `LLM API error for job ${analysisJobId}`,
          err instanceof Error ? err : undefined,
        );
      });

    // OpenAI structured outputs guarantee schema conformance; light sanity check
    const parsed = rawResponse as {
      findings: AnalysisFinding[];
      summary: string;
    };
    if (!Array.isArray(parsed.findings) || typeof parsed.summary !== 'string') {
      throw new PermanentError(
        `LLM structured output for job ${analysisJobId} did not match expected shape`,
      );
    }

    const rulesetsConsulted = this.extractRulesetsConsulted(rerankedChunks);

    const result: AnalysisResult = {
      findings: parsed.findings,
      summary: parsed.summary,
      model: this.llmService.getModel(),
      documentChunks: documentChunks.length,
      rulesetChunksMatched: rerankedChunks.length,
      rulesetsConsulted,
      reranked,
    };

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

  /**
   * Build a concise BM25 search query from the document title and first few chunk texts.
   * PostgreSQL's plainto_tsquery handles stopword removal and stemming.
   * Cap at ~500 chars to keep the tsquery plan efficient.
   */
  private buildBm25Query(title: string, chunkTexts: string[]): string {
    const preview = chunkTexts.slice(0, 3).join(' ');
    const combined = `${title} ${preview}`;
    return combined.slice(0, 500);
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

import { EmbeddingService, TextChunkerService } from '@lib/embedding';
import type { DocumentAnalysisJobData } from '@lib/queue';
import { PermanentError, RetryableError } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';
import {
  AnalysisFinding,
  AnalysisResult,
  AnalysisWarning,
  RiskLevel,
} from '../interfaces/analysis-result.interface';
import { AnalysisJobWriteRepository } from '../repositories/analysis-job-write.repository';
import {
  DocumentReadRepository,
  DocumentSection,
} from '../repositories/document-read.repository';
import {
  RulesetChunkMatch,
  RulesetChunkSearchRepository,
} from '../repositories/ruleset-chunk-search.repository';
import { baselineRiskOf, citationOf, finalRisk } from './citation';
import { createQuoteLocator } from './evidence';
import { LlmService } from './llm.service';
import { PROMPT_VERSION, PromptBuilderService } from './prompt-builder.service';
import { RerankerService } from './reranker.service';

/** The model's output; clauseId can only be one of the IDs we supplied (C1, C2, …). */
function analysisResultSchema(
  clauseIds: string[],
): ResponseFormatJSONSchema.JSONSchema {
  return {
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
              clauseId: { type: 'string', enum: clauseIds },
              riskLevel: { type: 'string', enum: ['high', 'medium', 'low'] },
              riskReason: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              suggestion: { type: 'string' },
              evidence: { type: 'string' },
            },
            required: [
              'clauseId',
              'riskLevel',
              'riskReason',
              'title',
              'description',
              'suggestion',
              'evidence',
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
}

interface ModelFinding {
  clauseId: string;
  riskLevel: RiskLevel;
  riskReason: string;
  title: string;
  description: string;
  suggestion: string;
  evidence: string;
}

/** Document chunks sampled for the rerank query, and its size in characters. */
const RERANK_QUERY_SAMPLES = 8;
const RERANK_QUERY_MAX_CHARS = 4000;

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

  /**
   * Runs one attempt. A transient failure leaves the job `processing` so BullMQ's next attempt
   * can pick it up; the job is marked `failed` only on a permanent error or the last attempt.
   */
  async analyze(
    data: DocumentAnalysisJobData,
    attempt = 1,
    maxAttempts = 1,
  ): Promise<void> {
    const { analysisJobId, documentId, tenantId } = data;
    const rulesetIds: string[] | undefined = Array.isArray(data.rulesetIds)
      ? data.rulesetIds
      : undefined;

    // Read in the payload's tenant: a job of another tenant is not found, so it fails closed
    const job = await this.analysisJobWriteRepository
      .findById(tenantId, analysisJobId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error fetching analysis job ${analysisJobId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!job) {
      throw new PermanentError(
        `Analysis job ${analysisJobId} not found in tenant ${tenantId} — skipping`,
      );
    }

    if (job.document_id !== documentId) {
      throw new PermanentError(
        `Analysis job ${analysisJobId} is for another document than the payload names — refusing`,
      );
    }

    if (job.status !== 'queued' && job.status !== 'processing') {
      throw new PermanentError(
        `Analysis job ${analysisJobId} is in terminal state '${job.status}' — skipping re-run`,
      );
    }

    const claimed = await this.analysisJobWriteRepository
      .markProcessing(tenantId, analysisJobId)
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
      await this.runPipeline(
        tenantId,
        analysisJobId,
        job.document_id,
        rulesetIds,
      );
      this.logger.log(
        `Pipeline completed in ${Date.now() - pipelineStart}ms for job=${analysisJobId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const final = error instanceof PermanentError || attempt >= maxAttempts;

      if (final) {
        await this.analysisJobWriteRepository
          .markFailed(tenantId, analysisJobId, message)
          .catch((dbErr: unknown) => {
            this.logger.error(
              `Failed to mark job ${analysisJobId} as failed after pipeline error: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
            );
          });
      } else {
        this.logger.warn(
          `Attempt ${attempt}/${maxAttempts} of job ${analysisJobId} failed (will retry): ${message}`,
        );
      }

      throw error;
    }
  }

  private async runPipeline(
    tenantId: string,
    analysisJobId: string,
    documentId: string,
    rulesetIds?: string[],
  ): Promise<void> {
    const document = await this.documentReadRepository
      .findContentById(tenantId, documentId)
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
    const hasStructure =
      Array.isArray(document.content_structured) &&
      document.content_structured.length > 0;

    this.logger.log(
      `Starting RAG pipeline for job=${analysisJobId} document=${documentId}` +
        (scoped ? ` scoped to ${rulesetIds.length} rulesets` : ' (global)') +
        ` structured=${hasStructure}`,
    );

    // Build structured content string when LAYOUT sections are available.
    // Each section is prefixed with a markdown heading so both the embedding
    // model and the LLM receive section-boundary context.
    // Falls back to raw flat text for documents ingested before this feature.
    const contentForAnalysis = hasStructure
      ? this.buildStructuredContent(document.content_structured!)
      : document.content;

    // Chunk the document (structured content gives embeddings better context)
    const documentChunks = this.textChunkerService.chunk(contentForAnalysis);
    this.logger.log(`Document chunked into ${documentChunks.length} chunks`);

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
    // The whole document: the search ORs its most frequent terms (see hybridSearchBatch)
    const bm25Query = `${document.title}\n${contentForAnalysis}`;
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

    // Re-rank via Cohere; the query is document text only, never the title
    const rerankQuery = this.buildRerankQuery(chunkTexts);
    const { chunks: rerankedChunks, reranked } =
      await this.rerankerService.rerank(rerankQuery, topChunks);

    this.logger.log(
      `After rerank: ${rerankedChunks.length} chunks (reranked=${reranked})`,
    );

    // With nothing to check against, any answer would be an unfounded "compliant"
    if (rerankedChunks.length === 0) {
      throw new PermanentError(
        scoped
          ? 'No regulatory clauses were found in the selected rulesets for this document, so nothing was checked'
          : 'No regulatory clauses were found for this document, so nothing was checked',
      );
    }

    // Build prompt — pass structured content so the LLM sees section headings
    const { systemPrompt, userMessage, wasDocumentTruncated, clauses } =
      this.promptBuilderService.buildPrompt(
        documentId,
        contentForAnalysis,
        rerankedChunks,
      );

    if (wasDocumentTruncated) {
      this.logger.warn(
        `Document ${documentId} was truncated to fit context window`,
      );
    }

    // Call LLM with structured output enforcement
    const rawResponse = await this.llmService
      .chatCompletion({
        systemPrompt,
        userMessage,
        responseSchema: analysisResultSchema([...clauses.keys()]),
      })
      .catch((err: unknown) => {
        throw new RetryableError(
          `LLM API error for job ${analysisJobId}`,
          err instanceof Error ? err : undefined,
        );
      });

    // OpenAI structured outputs guarantee schema conformance; light sanity check
    const parsed = rawResponse as {
      findings: ModelFinding[];
      summary: string;
    };
    if (!Array.isArray(parsed.findings) || typeof parsed.summary !== 'string') {
      throw new PermanentError(
        `LLM structured output for job ${analysisJobId} did not match expected shape`,
      );
    }

    // Keep only findings that rest on a clause we supplied and quote the contract; the citation
    // and the baseline risk come from that clause's ruleset data
    const findInContent = createQuoteLocator(document.content);
    const findInAnalysed =
      contentForAnalysis === document.content
        ? null
        : createQuoteLocator(contentForAnalysis);
    const findings: AnalysisFinding[] = [];
    let unverifiedFindingsDropped = 0;
    let groundedFindings = 0;
    for (const finding of parsed.findings) {
      const chunk = clauses.get(finding.clauseId);
      if (!chunk) continue;
      groundedFindings++;
      const quote =
        typeof finding.evidence === 'string' ? finding.evidence.trim() : '';
      let evidence: { text: string; offset: number | null } | null = null;
      if (!quote) {
        // No quote is only an answer for a mandatory clause the contract leaves out
        if (chunk.metadata.isRequired === true) {
          evidence = { text: '', offset: null };
        }
      } else {
        const span = findInContent(quote);
        if (span) {
          evidence = {
            text: document.content.slice(span.start, span.end),
            offset: span.start,
          };
        } else if (findInAnalysed?.(quote)) {
          evidence = { text: quote, offset: null };
        }
      }
      if (!evidence) {
        unverifiedFindingsDropped++;
        continue;
      }
      const rulesetKey = chunk.metadata.rulesetKey;
      const baselineRiskLevel = baselineRiskOf(chunk.metadata);
      const { riskLevel, raised } = finalRisk(
        baselineRiskLevel,
        finding.riskLevel,
      );
      const riskReason =
        typeof finding.riskReason === 'string' ? finding.riskReason.trim() : '';
      findings.push({
        clauseId: finding.clauseId,
        citation: citationOf(chunk.metadata),
        riskLevel,
        baselineRiskLevel,
        ...(raised && riskReason && { riskReason }),
        title: finding.title,
        description: finding.description,
        suggestion: finding.suggestion,
        evidence: evidence.text,
        evidenceOffset: evidence.offset,
        chunkId: chunk.id,
        rulesetKey: typeof rulesetKey === 'string' ? rulesetKey : null,
      });
    }
    const ungroundedFindingsDropped = parsed.findings.length - groundedFindings;
    if (ungroundedFindingsDropped > 0) {
      this.logger.warn(
        `Dropped ${ungroundedFindingsDropped} findings citing no supplied clause for job=${analysisJobId}`,
      );
    }
    if (unverifiedFindingsDropped > 0) {
      this.logger.warn(
        `Dropped ${unverifiedFindingsDropped} findings whose quote isn't in the document for job=${analysisJobId}`,
      );
    }

    const rulesetIdsSearched = rulesetIds ?? [];
    const rulesetIdsWithContext = new Set(
      rerankedChunks.map((c) => c.rulesetId),
    );
    const rulesetIdsWithoutContext = rulesetIdsSearched.filter(
      (id) => !rulesetIdsWithContext.has(id),
    );

    const warnings: AnalysisWarning[] = [];
    if (wasDocumentTruncated) warnings.push('document_truncated');
    if (!reranked) warnings.push('not_reranked');
    if (rulesetIdsWithoutContext.length > 0) {
      warnings.push('rulesets_without_context');
    }
    if (ungroundedFindingsDropped > 0) {
      warnings.push('ungrounded_findings_dropped');
    }
    if (unverifiedFindingsDropped > 0) {
      warnings.push('unverified_evidence_dropped');
    }
    if (findings.length === 0) warnings.push('no_findings');

    const result: AnalysisResult = {
      findings,
      summary: parsed.summary,
      model: this.llmService.getModel(),
      documentChunks: documentChunks.length,
      rulesetChunksMatched: rerankedChunks.length,
      rulesetsConsulted: this.extractRulesetsConsulted(rerankedChunks),
      rulesetsCited: [
        ...new Set(
          findings
            .map((f) => f.rulesetKey)
            .filter((key): key is string => !!key),
        ),
      ],
      rulesetIdsSearched,
      rulesetIdsWithoutContext,
      reranked,
      truncated: wasDocumentTruncated,
      ungroundedFindingsDropped,
      unverifiedFindingsDropped,
      warnings,
      provenance: {
        promptVersion: PROMPT_VERSION,
        embeddingModel: this.embeddingService.getModel(),
        rulesetVersionIds: [
          ...new Set(rerankedChunks.map((c) => c.rulesetVersionId)),
        ],
        suppliedChunkIds: [...clauses.values()].map((c) => c.id),
        retrieval: {
          topKPerQuery: this.topKPerQuery,
          vectorLimit: this.vectorLimit,
          bm25Limit: this.bm25Limit,
          maxHybridResults: this.maxHybridResults,
          rerankModel: this.rerankerService.getModel(),
          rerankTopN: this.rerankerService.getTopN(),
        },
      },
    };
    const status =
      warnings.length > 0 ? 'completed_with_warnings' : 'completed';

    await this.analysisJobWriteRepository
      .markCompleted(tenantId, analysisJobId, status, result)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error storing result for job ${analysisJobId}`,
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Analysis ${status} for job=${analysisJobId}: ${result.findings.length} findings, ` +
        `warnings=[${warnings.join(', ')}]`,
    );
  }

  /**
   * Render DocumentSection[] into a single markdown-formatted string.
   * Section headings become ## markers so both the embedding model and the LLM
   * receive explicit section-boundary context. Content within each section is
   * preserved verbatim.
   */
  private buildStructuredContent(sections: DocumentSection[]): string {
    return sections
      .map((s) => (s.heading ? `## ${s.heading}\n\n${s.content}` : s.content))
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * The rerank query: chunks sampled evenly across the whole document (not just its opening,
   * which is mostly preamble and party details), within the reranker's query budget.
   */
  private buildRerankQuery(chunkTexts: string[]): string {
    const samples = Math.min(RERANK_QUERY_SAMPLES, chunkTexts.length);
    const step = chunkTexts.length / Math.max(samples, 1);
    const sampled = Array.from(
      { length: samples },
      (_, i) => chunkTexts[Math.floor(i * step)],
    );
    const perSample = Math.floor(RERANK_QUERY_MAX_CHARS / Math.max(samples, 1));
    return sampled
      .map((text) => text.slice(0, perSample))
      .join('\n')
      .slice(0, RERANK_QUERY_MAX_CHARS);
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

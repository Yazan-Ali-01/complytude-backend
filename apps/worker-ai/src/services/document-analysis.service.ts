import {
  EmbeddingService,
  openAiRegion,
  TextChunkerService,
} from '@lib/embedding';
import {
  ANALYSIS_DOCUMENT_TYPES,
  ANALYSIS_JURISDICTIONS,
  type DocumentAnalysisJobData,
} from '@lib/queue';
import {
  ENTITLEMENT_JOB_NAMES,
  PermanentError,
  QUEUE_NAMES,
  QueueProducerService,
  RetryableError,
} from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';
import {
  AnalysisFinding,
  AnalysisResult,
  AnalysisWarning,
  ClauseStatus,
  ClauseVerdict,
  ProcessorUse,
  RiskLevel,
} from '../interfaces/analysis-result.interface';
import { RedactionService } from '../redaction/redaction.service';
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
import { batches, relevantSections, runLimited } from './judging';
import { LlmService } from './llm.service';
import {
  type AnalysisContext,
  PROMPT_VERSION,
  PromptBuilderService,
} from './prompt-builder.service';

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
        verdicts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              clauseId: { type: 'string', enum: clauseIds },
              status: {
                type: 'string',
                enum: ['violated', 'compliant', 'not_applicable', 'unclear'],
              },
              reason: { type: 'string' },
            },
            required: ['clauseId', 'status', 'reason'],
            additionalProperties: false,
          },
        },
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
      required: ['verdicts', 'findings', 'summary'],
      additionalProperties: false,
    },
  };
}

interface ModelVerdict {
  clauseId: string;
  status: Exclude<ClauseStatus, 'unassessed'>;
  reason: string;
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

@Injectable()
export class DocumentAnalysisService {
  private readonly logger = new Logger(DocumentAnalysisService.name);

  private readonly topKPerQuery: number;
  private readonly vectorLimit: number;
  private readonly bm25Limit: number;
  private readonly maxHybridResults: number;
  private readonly judgeBatchSize: number;
  private readonly judgeConcurrency: number;
  private readonly maxJudgeCalls: number;
  private readonly sectionsPerClause: number;
  private readonly optionalClauseLimit: number;

  constructor(
    private readonly analysisJobWriteRepository: AnalysisJobWriteRepository,
    private readonly documentReadRepository: DocumentReadRepository,
    private readonly rulesetChunkSearchRepository: RulesetChunkSearchRepository,
    private readonly textChunkerService: TextChunkerService,
    private readonly embeddingService: EmbeddingService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly llmService: LlmService,
    private readonly redactionService: RedactionService,
    configService: ConfigService,
    private readonly queueProducer: QueueProducerService,
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
    this.judgeBatchSize = configService.get<number>(
      'workerAi.ragJudgeBatchSize',
      8,
    );
    this.judgeConcurrency = configService.get<number>(
      'workerAi.ragJudgeConcurrency',
      3,
    );
    this.maxJudgeCalls = configService.get<number>(
      'workerAi.ragMaxJudgeCalls',
      10,
    );
    this.sectionsPerClause = configService.get<number>(
      'workerAi.ragSectionsPerClause',
      4,
    );
    this.optionalClauseLimit = configService.get<number>(
      'workerAi.ragOptionalClauseLimit',
      25,
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
        {
          ...(data.jurisdiction &&
            data.jurisdiction in ANALYSIS_JURISDICTIONS && {
              jurisdiction: data.jurisdiction,
            }),
          ...(data.documentType &&
            data.documentType in ANALYSIS_DOCUMENT_TYPES && {
              documentType: data.documentType,
            }),
        },
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
        await this.refundReview(tenantId, analysisJobId);
      } else {
        this.logger.warn(
          `Attempt ${attempt}/${maxAttempts} of job ${analysisJobId} failed (will retry): ${message}`,
        );
      }

      throw error;
    }
  }

  /**
   * The review was paid for when it was queued (`contract_reviews_per_month`): one that failed for
   * good after this worker claimed it is given back.
   */
  /**
   * The processors this document's data went to, and where: OCR at ingestion for its
   * scanned pages, OpenAI for embeddings and the analysis.
   */
  private processorsUsed(ocrPages: number[] | null): ProcessorUse[] {
    return [
      ...(ocrPages && ocrPages.length > 0
        ? [
            {
              processor: 'azure-document-intelligence' as const,
              purpose: 'ocr' as const,
              region: null,
              pages: ocrPages,
            },
          ]
        : []),
      {
        processor: 'openai',
        purpose: 'embeddings',
        region: openAiRegion(this.embeddingService.getBaseUrl()),
        model: this.embeddingService.getModel(),
      },
      {
        processor: 'openai',
        purpose: 'analysis',
        region: openAiRegion(this.llmService.getBaseUrl()),
        model: this.llmService.getModel(),
      },
    ];
  }

  private async refundReview(
    tenantId: string,
    analysisJobId: string,
  ): Promise<void> {
    await this.queueProducer
      .enqueue(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.USAGE_REFUND,
        {
          tenantId,
          resourceId: analysisJobId,
          resourceType: 'analysis_job',
          featureKey: 'contract_reviews_per_month',
          units: 1,
        },
        { jobId: `usage-refund-review-${analysisJobId}` },
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Could not enqueue the review refund for job ${analysisJobId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async runPipeline(
    tenantId: string,
    analysisJobId: string,
    documentId: string,
    rulesetIds: string[] | undefined,
    context: AnalysisContext,
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
    const analysedOriginal = hasStructure
      ? this.buildStructuredContent(document.content_structured!)
      : document.content;

    // Personal data is masked before anything leaves: chunking, embeddings and the prompt only
    // ever see the redacted text. No redaction, no provider call.
    const redaction = await this.redactionService
      .redact(analysedOriginal)
      .catch((err: unknown) => {
        throw new RetryableError(
          `Redaction failed for document ${documentId}; nothing was sent to an AI provider`,
          err instanceof Error ? err : undefined,
        );
      });
    const contentForAnalysis = redaction.text;
    this.logger.log(
      `Redacted document=${documentId}: ${redaction.entities.size} values masked` +
        (this.redactionService.isEnabled() ? '' : ' (redaction is off)'),
    );

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

    // The checklist: every required clause of the applicable rulesets, whatever the search finds
    const required = scoped
      ? await this.rulesetChunkSearchRepository
          .findRequiredClauses(rulesetIds)
          .catch((err: unknown) => {
            throw new RetryableError(
              'DB error loading the required clauses',
              err instanceof Error ? err : undefined,
            );
          })
      : [];

    // The rest by similarity: hybrid search (vector + BM25, merged via RRF), in its order.
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
        // Only chunks embedded by the same model: vectors of different models aren't comparable
        this.embeddingService.getModel(),
      )
      .catch((err: unknown) => {
        throw new RetryableError(
          'Hybrid search (vector + BM25) error',
          err instanceof Error ? err : undefined,
        );
      });
    const requiredIds = new Set(required.map((c) => c.id));
    const optional = topChunks.filter((c) => !requiredIds.has(c.id));

    // No reranking: the evaluation scored the search order no worse than a reranker's
    const similar = optional.slice(0, this.optionalClauseLimit);

    const supplied = [...required, ...similar];
    this.logger.log(
      `Clauses for job=${analysisJobId}: ${required.length} required, ${similar.length} by similarity`,
    );

    // With nothing to check against, any answer would be an unfounded "compliant"
    if (supplied.length === 0) {
      throw new PermanentError(
        scoped
          ? 'No regulatory clauses were found in the selected rulesets for this document, so nothing was checked'
          : 'No regulatory clauses were found for this document, so nothing was checked',
      );
    }

    // Judge clause by clause, in bounded batches; clauses beyond the call budget stay unassessed
    const clauses = new Map(
      supplied.map((chunk, index) => [`C${index + 1}`, chunk]),
    );
    const judged = [...clauses].slice(
      0,
      this.judgeBatchSize * this.maxJudgeCalls,
    );
    const clauseEmbeddings = await this.rulesetChunkSearchRepository
      .findEmbeddings(
        judged.map(([, chunk]) => chunk.id),
        this.embeddingService.getModel(),
      )
      .catch((err: unknown) => {
        throw new RetryableError(
          'DB error loading clause embeddings',
          err instanceof Error ? err : undefined,
        );
      });
    const sectionEmbeddings = embeddings.map((e) => e.embedding);

    const answers = await runLimited(
      batches(judged, this.judgeBatchSize),
      this.judgeConcurrency,
      async (batch) => {
        const batchClauses = new Map(batch);
        const prompt = this.promptBuilderService.buildPrompt(
          documentId,
          {
            full: contentForAnalysis,
            sections: chunkTexts,
            relevant: relevantSections(
              batch.map(([, chunk]) => clauseEmbeddings.get(chunk.id)),
              sectionEmbeddings,
              this.sectionsPerClause,
            ),
          },
          batchClauses,
          context,
        );
        const { data, usage } = await this.llmService
          .chatCompletion({
            systemPrompt: prompt.systemPrompt,
            userMessage: prompt.userMessage,
            responseSchema: analysisResultSchema([...batchClauses.keys()]),
          })
          .catch((err: unknown) => {
            throw new RetryableError(
              `LLM API error for job ${analysisJobId}`,
              err instanceof Error ? err : undefined,
            );
          });
        // OpenAI structured outputs guarantee schema conformance; light sanity check
        const parsed = data as {
          verdicts?: ModelVerdict[];
          findings: ModelFinding[];
          summary: string;
        };
        if (
          !Array.isArray(parsed.findings) ||
          typeof parsed.summary !== 'string'
        ) {
          throw new PermanentError(
            `LLM structured output for job ${analysisJobId} did not match expected shape`,
          );
        }
        return { batchClauses, parsed, usage, prompt };
      },
    );
    const wasDocumentTruncated = answers.some(
      (a) => a.prompt.wasDocumentTruncated,
    );
    const documentExcerpted = answers.some((a) => a.prompt.excerpted);
    if (wasDocumentTruncated) {
      this.logger.warn(
        `A section of document ${documentId} was truncated to fit the context window`,
      );
    }

    // Keep only findings that rest on a clause of their own batch and quote the contract; the
    // citation and the baseline risk come from that clause's ruleset data
    const findInContent = createQuoteLocator(document.content);
    const findInRedacted = createQuoteLocator(contentForAnalysis);
    const verdicts = new Map<string, ModelVerdict>();
    const findings: AnalysisFinding[] = [];
    let unverifiedFindingsDropped = 0;
    let inconsistentFindingsDropped = 0;
    let ungroundedFindingsDropped = 0;
    for (const { batchClauses, parsed } of answers) {
      // The model's verdict on each of the batch's clauses (the first one if it gave several)
      for (const verdict of Array.isArray(parsed.verdicts)
        ? parsed.verdicts
        : []) {
        if (
          batchClauses.has(verdict.clauseId) &&
          !verdicts.has(verdict.clauseId)
        ) {
          verdicts.set(verdict.clauseId, verdict);
        }
      }
      for (const finding of parsed.findings) {
        const chunk = batchClauses.get(finding.clauseId);
        if (!chunk) {
          ungroundedFindingsDropped++;
          continue;
        }
        // Only a violated or unclear clause may carry a finding
        const status = verdicts.get(finding.clauseId)?.status;
        if (status === 'compliant' || status === 'not_applicable') {
          inconsistentFindingsDropped++;
          continue;
        }
        const quote =
          typeof finding.evidence === 'string' ? finding.evidence.trim() : '';
        let evidence: { text: string; offset: number | null } | null = null;
        if (!quote) {
          // No quote is only an answer for a mandatory clause the contract leaves out
          if (chunk.metadata.isRequired === true) {
            evidence = { text: '', offset: null };
          }
        } else {
          // Found in the redacted text the model saw, then mapped back to the original passage
          const span = findInRedacted(quote);
          if (span) {
            const at = redaction.toOriginal(span.start, span.end);
            const passage = analysedOriginal.slice(at.start, at.end);
            const inContent =
              analysedOriginal === document.content
                ? { start: at.start, end: at.end }
                : findInContent(passage);
            evidence = inContent
              ? {
                  text: document.content.slice(inContent.start, inContent.end),
                  offset: inContent.start,
                }
              : { text: passage, offset: null };
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
          typeof finding.riskReason === 'string'
            ? finding.riskReason.trim()
            : '';
        findings.push({
          clauseId: finding.clauseId,
          citation: citationOf(chunk.metadata),
          riskLevel,
          baselineRiskLevel,
          ...(raised &&
            riskReason && { riskReason: redaction.rehydrate(riskReason) }),
          title: redaction.rehydrate(finding.title),
          description: redaction.rehydrate(finding.description),
          suggestion: redaction.rehydrate(finding.suggestion),
          evidence: evidence.text,
          evidenceOffset: evidence.offset,
          chunkId: chunk.id,
          rulesetKey: typeof rulesetKey === 'string' ? rulesetKey : null,
        });
      }
    }
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
    if (inconsistentFindingsDropped > 0) {
      this.logger.warn(
        `Dropped ${inconsistentFindingsDropped} findings on clauses the model called compliant or not applicable for job=${analysisJobId}`,
      );
    }

    // Every supplied clause's verdict: the model's, else violated when a finding survived, else unassessed
    const withFindings = new Set(findings.map((f) => f.clauseId));
    const clauseVerdicts: ClauseVerdict[] = [...clauses].map(
      ([clauseId, chunk]) => {
        const verdict = verdicts.get(clauseId);
        const status: ClauseStatus =
          verdict?.status ??
          (withFindings.has(clauseId) ? 'violated' : 'unassessed');
        return {
          clauseId,
          chunkId: chunk.id,
          citation: citationOf(chunk.metadata),
          status,
          reason: verdict ? redaction.rehydrate(verdict.reason) : '',
        };
      },
    );
    const summary = redaction.rehydrate(
      answers
        .map((a) => a.parsed.summary.trim())
        .filter(Boolean)
        .join(' '),
    );
    const usage = {
      modelCalls: answers.length,
      promptTokens: answers.reduce((sum, a) => sum + a.usage.promptTokens, 0),
      completionTokens: answers.reduce(
        (sum, a) => sum + a.usage.completionTokens,
        0,
      ),
      embeddingTokens: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
    };

    const rulesetIdsSearched = rulesetIds ?? [];
    const rulesetIdsWithContext = new Set(supplied.map((c) => c.rulesetId));
    const rulesetIdsWithoutContext = rulesetIdsSearched.filter(
      (id) => !rulesetIdsWithContext.has(id),
    );

    // D-9: rules not yet reviewed by the law firm are said to be so on every result
    const draftVersionIds = await this.rulesetChunkSearchRepository
      .findDraftVersionIds([
        ...new Set(supplied.map((c) => c.rulesetVersionId)),
      ])
      .catch((err: unknown) => {
        throw new RetryableError(
          'DB error reading the review status of the rulesets',
          err instanceof Error ? err : undefined,
        );
      });

    const warnings: AnalysisWarning[] = [];
    if (draftVersionIds.size > 0) warnings.push('rules_not_reviewed');
    if (wasDocumentTruncated) warnings.push('document_truncated');
    if (rulesetIdsWithoutContext.length > 0) {
      warnings.push('rulesets_without_context');
    }
    if (ungroundedFindingsDropped > 0) {
      warnings.push('ungrounded_findings_dropped');
    }
    if (unverifiedFindingsDropped > 0) {
      warnings.push('unverified_evidence_dropped');
    }
    if (inconsistentFindingsDropped > 0) {
      warnings.push('inconsistent_findings_dropped');
    }
    if (clauseVerdicts.some((v) => v.status === 'unassessed')) {
      warnings.push('clauses_not_assessed');
    }
    if (findings.length === 0) warnings.push('no_findings');

    const result: AnalysisResult = {
      findings,
      clauseVerdicts,
      scope: {
        jurisdiction: context.jurisdiction ?? null,
        documentType: context.documentType ?? null,
      },
      summary,
      model: this.llmService.getModel(),
      documentChunks: documentChunks.length,
      rulesetChunksMatched: supplied.length,
      requiredClausesChecked: required.length,
      rulesetsConsulted: this.extractRulesetsConsulted(supplied),
      rulesetsCited: [
        ...new Set(
          findings
            .map((f) => f.rulesetKey)
            .filter((key): key is string => !!key),
        ),
      ],
      rulesetIdsSearched,
      rulesetIdsWithoutContext,
      truncated: wasDocumentTruncated,
      documentExcerpted,
      usage,
      ungroundedFindingsDropped,
      unverifiedFindingsDropped,
      inconsistentFindingsDropped,
      warnings,
      provenance: {
        processors: this.processorsUsed(document.ocr_pages),
        promptVersion: PROMPT_VERSION,
        redaction: {
          enabled: this.redactionService.isEnabled(),
          valuesMasked: redaction.entities.size,
        },
        embeddingModel: this.embeddingService.getModel(),
        rulesetVersionIds: [
          ...new Set(supplied.map((c) => c.rulesetVersionId)),
        ],
        suppliedChunkIds: supplied.map((c) => c.id),
        judging: {
          batchSize: this.judgeBatchSize,
          concurrency: this.judgeConcurrency,
          maxCalls: this.maxJudgeCalls,
          sectionsPerClause: this.sectionsPerClause,
        },
        retrieval: {
          topKPerQuery: this.topKPerQuery,
          vectorLimit: this.vectorLimit,
          bm25Limit: this.bm25Limit,
          maxHybridResults: this.maxHybridResults,
          optionalClauseLimit: this.optionalClauseLimit,
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

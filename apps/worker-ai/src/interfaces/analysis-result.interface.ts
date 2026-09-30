export type RiskLevel = 'high' | 'medium' | 'low';

/** The model's verdict on a supplied clause; `unassessed` when it gave none. */
export type ClauseStatus =
  | 'violated'
  | 'compliant'
  | 'not_applicable'
  | 'unclear'
  | 'unassessed';

export interface ClauseVerdict {
  clauseId: string;
  chunkId: string;
  citation: string;
  status: ClauseStatus;
  reason: string;
}

export interface AnalysisFinding {
  /** The supplied clause the finding rests on (C1, C2, … in the prompt); always one we gave it. */
  clauseId: string;
  /** Built from the clause's ruleset data (authority, ruleset, version, article), not by the model. */
  citation: string;
  /** The clause's own severity, or the model's level when it raised it (with riskReason). */
  riskLevel: RiskLevel;
  /** From the clause's severity (critical/high → high); null when the ruleset gives none. */
  baselineRiskLevel: RiskLevel | null;
  /** The model's reason, kept only when it raised the risk above the baseline. */
  riskReason?: string;
  title: string;
  description: string;
  suggestion: string;
  /**
   * The contract passage the finding is about, as it appears in the document; empty only for a
   * required clause the contract omits.
   */
  evidence: string;
  /** Where `evidence` starts in the document's text, or null (an omission, or a quote found only in the sectioned text). */
  evidenceOffset: number | null;
  /** The retrieved ruleset chunk behind clauseId. */
  chunkId: string;
  rulesetKey: string | null;
}

/**
 * Why a completed analysis should not be read as a clean bill of health.
 * - document_truncated: only the start of the document fit the model's context
 * - not_reranked: reranking failed, so the clauses used may not be the most relevant
 * - rulesets_without_context: a requested ruleset contributed no clauses
 * - ungrounded_findings_dropped: findings that cited no supplied clause were removed
 * - unverified_evidence_dropped: findings whose quote isn't in the document were removed
 * - inconsistent_findings_dropped: findings on a clause the model itself called compliant or not applicable were removed
 * - clauses_not_assessed: the model gave no verdict for some supplied clauses
 * - no_findings: nothing was reported; needs a human check, not "compliant"
 */
export type AnalysisWarning =
  | 'document_truncated'
  | 'not_reranked'
  | 'rulesets_without_context'
  | 'ungrounded_findings_dropped'
  | 'unverified_evidence_dropped'
  | 'inconsistent_findings_dropped'
  | 'clauses_not_assessed'
  | 'no_findings';

/** A third-party processor an analysis sent document data to (listed in docs/SUBPROCESSORS.md). */
export interface ProcessorUse {
  processor: 'openai' | 'cohere' | 'azure-document-intelligence';
  purpose: 'embeddings' | 'analysis' | 'rerank' | 'ocr';
  /**
   * Where the data was processed: the provider's data-residency region, `global`, or null when
   * the code can't tell (the OCR resource's region is set in Azure; the register lists it).
   */
  region: string | null;
  model?: string;
  /** OCR only: the document's pages it read, at ingestion. */
  pages?: number[];
}

/** What produced a result, so runs can be reproduced and compared (evaluation, feedback). */
export interface AnalysisProvenance {
  /** Every processor that received this document's data, in pipeline order. */
  processors: ProcessorUse[];
  /** PROMPT_VERSION in prompt-builder.service.ts. */
  promptVersion: number;
  /** Whether personal data was masked before the provider calls, and how many distinct values. */
  redaction: { enabled: boolean; valuesMasked: number };
  embeddingModel: string;
  /** Versions of the rulesets whose clauses the model was given. */
  rulesetVersionIds: string[];
  /** The ruleset chunks behind C1, C2, … in the prompt, in that order. */
  suppliedChunkIds: string[];
  retrieval: {
    topKPerQuery: number;
    vectorLimit: number;
    bm25Limit: number;
    maxHybridResults: number;
    rerankModel: string;
    rerankTopN: number;
  };
  judging: {
    batchSize: number;
    concurrency: number;
    maxCalls: number;
    sectionsPerClause: number;
  };
}

export interface AnalysisResult {
  findings: AnalysisFinding[];
  /** One per supplied clause: violated, compliant, not applicable, unclear or unassessed. */
  clauseVerdicts: ClauseVerdict[];
  /** What the user said the contract is; null when rulesets were picked without it. */
  scope: { jurisdiction: string | null; documentType: string | null };
  summary: string;
  model: string;
  documentChunks: number;
  /** Clauses the model was given: every required clause of the rulesets, then the retrieved ones. */
  rulesetChunksMatched: number;
  requiredClausesChecked: number;
  /** Rulesets the retrieved clauses came from. */
  rulesetsConsulted: string[];
  /** Rulesets at least one finding cites. */
  rulesetsCited: string[];
  /** Ruleset IDs the search was limited to; empty = all rulesets. */
  rulesetIdsSearched: string[];
  /** Requested ruleset IDs that contributed no clause. */
  rulesetIdsWithoutContext: string[];
  reranked: boolean;
  /** A single document section didn't fit the budget and was cut. */
  truncated: boolean;
  /** Some clauses were judged against the document's most relevant sections, not all of it. */
  documentExcerpted: boolean;
  /** For metering: model calls and tokens, embedding tokens. */
  usage: {
    modelCalls: number;
    promptTokens: number;
    completionTokens: number;
    embeddingTokens: number;
  };
  ungroundedFindingsDropped: number;
  /** Findings dropped because their quote couldn't be found in the document. */
  unverifiedFindingsDropped: number;
  /** Findings dropped because the model's own verdict on their clause was compliant or not applicable. */
  inconsistentFindingsDropped: number;
  warnings: AnalysisWarning[];
  provenance: AnalysisProvenance;
}

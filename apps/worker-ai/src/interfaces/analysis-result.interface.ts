export type RiskLevel = 'high' | 'medium' | 'low';

export interface AnalysisFinding {
  /** The supplied clause the finding rests on (C1, C2, … in the prompt); always one we gave it. */
  clauseId: string;
  clauseRef: string;
  riskLevel: RiskLevel;
  title: string;
  description: string;
  suggestion: string;
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
 * - no_findings: nothing was reported; needs a human check, not "compliant"
 */
export type AnalysisWarning =
  | 'document_truncated'
  | 'not_reranked'
  | 'rulesets_without_context'
  | 'ungrounded_findings_dropped'
  | 'no_findings';

/** What produced a result, so runs can be reproduced and compared (evaluation, feedback). */
export interface AnalysisProvenance {
  /** PROMPT_VERSION in prompt-builder.service.ts. */
  promptVersion: number;
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
}

export interface AnalysisResult {
  findings: AnalysisFinding[];
  summary: string;
  model: string;
  documentChunks: number;
  rulesetChunksMatched: number;
  /** Rulesets the retrieved clauses came from. */
  rulesetsConsulted: string[];
  /** Rulesets at least one finding cites. */
  rulesetsCited: string[];
  /** Ruleset IDs the search was limited to; empty = all rulesets. */
  rulesetIdsSearched: string[];
  /** Requested ruleset IDs that contributed no clause. */
  rulesetIdsWithoutContext: string[];
  reranked: boolean;
  truncated: boolean;
  ungroundedFindingsDropped: number;
  warnings: AnalysisWarning[];
  provenance: AnalysisProvenance;
}

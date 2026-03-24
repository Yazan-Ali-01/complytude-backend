export type RiskLevel = 'high' | 'medium' | 'low';

export interface AnalysisFinding {
  clauseRef: string;
  riskLevel: RiskLevel;
  title: string;
  description: string;
  suggestion: string;
}

export interface AnalysisResult {
  findings: AnalysisFinding[];
  summary: string;
  model: string;
  documentChunks: number;
  rulesetChunksMatched: number;
  rulesetsConsulted: string[];
  reranked: boolean;
}

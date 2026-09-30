/** A plan's `risk_analysis_level`: how much of an analysis it shows. */
export type RiskAnalysisLevel = 'none' | 'critical_only' | 'full';

interface StoredFinding {
  clauseId?: string;
  riskLevel?: string;
}

interface StoredVerdict {
  clauseId?: string;
  reason?: string;
}

/**
 * What a tenant sees of a stored analysis result under its plan's risk analysis level. The stored
 * result is complete, so an upgrade shows past analyses in full.
 *
 * - `full`: everything.
 * - `critical_only`: high-risk findings only; `hiddenFindings` counts the rest, and the verdict
 *   reasons of clauses whose findings are all hidden are left out (the verdict itself stays).
 * - `none`: no findings or verdict reasons, only the count.
 */
export function resultForRiskLevel(
  result: Record<string, unknown> | null,
  level: RiskAnalysisLevel | undefined,
): Record<string, unknown> | null {
  if (!result || !level || level === 'full') return result;
  const findings = Array.isArray(result.findings)
    ? (result.findings as StoredFinding[])
    : [];
  const shown =
    level === 'critical_only'
      ? findings.filter((f) => f.riskLevel === 'high')
      : [];
  const shownClauses = new Set(shown.map((f) => f.clauseId));
  const hiddenClauses = new Set(
    findings
      .filter((f) => !shownClauses.has(f.clauseId))
      .map((f) => f.clauseId),
  );
  const verdicts = Array.isArray(result.clauseVerdicts)
    ? (result.clauseVerdicts as StoredVerdict[]).map((v) =>
        hiddenClauses.has(v.clauseId) ? { ...v, reason: '' } : v,
      )
    : result.clauseVerdicts;

  return {
    ...result,
    findings: shown,
    clauseVerdicts: verdicts,
    riskAnalysisLevel: level,
    hiddenFindings: findings.length - shown.length,
  };
}

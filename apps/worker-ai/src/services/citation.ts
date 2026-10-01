import type { RiskLevel } from '../interfaces/analysis-result.interface';

/**
 * A finding's citation and baseline severity come from the ruleset clause behind it (chunk
 * metadata written at ingestion), never from the model: a lawyer reads the citation first, and
 * an invented article number discredits the finding next to it.
 */
function text(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** e.g. "Department of Economic Development — UAE Federal Labour Law – Employment Terms v1.0.0, Art. 8: Written Employment Contract" */
export function citationOf(metadata: Record<string, unknown>): string {
  const ruleset =
    text(metadata, 'rulesetName') ??
    text(metadata, 'rulesetKey') ??
    'Unknown ruleset';
  const version = text(metadata, 'version');
  const where = text(metadata, 'article') ?? text(metadata, 'section');
  const title = text(metadata, 'clauseTitle');
  const authority = text(metadata, 'authorityName');

  const document = version ? `${ruleset} v${version}` : ruleset;
  const clause = [where, title].filter(Boolean).join(': ');
  const cited = clause ? `${document}, ${clause}` : document;
  return authority ? `${authority} — ${cited}` : cited;
}

/** Where the clause's official text is published, for a reviewer to open; null when not recorded. */
export function sourceUrlOf(metadata: Record<string, unknown>): string | null {
  return text(metadata, 'sourceUrl');
}

/** The clause's plain-language guidance: shown to the model beside the text, never cited. */
export function guidanceOf(metadata: Record<string, unknown>): string | null {
  return text(metadata, 'guidance');
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** The clause's own severity as a risk level (critical and high → high), or null when unknown. */
export function baselineRiskOf(
  metadata: Record<string, unknown>,
): RiskLevel | null {
  switch (text(metadata, 'severity')?.toLowerCase()) {
    case 'critical':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return null;
  }
}

/** The model may raise a finding above its clause's baseline, never lower it. */
export function finalRisk(
  baseline: RiskLevel | null,
  model: RiskLevel,
): { riskLevel: RiskLevel; raised: boolean } {
  if (baseline === null) return { riskLevel: model, raised: false };
  return RISK_RANK[model] > RISK_RANK[baseline]
    ? { riskLevel: model, raised: true }
    : { riskLevel: baseline, raised: false };
}

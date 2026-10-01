export interface Ruleset {
  id: string;
  key: string;
  name: string;
  description: string | null;
  authorityId: string | null;
  /** Jurisdiction codes (ANALYSIS_JURISDICTIONS) and document types it applies to. */
  jurisdictions: string[];
  documentTypes: string[];
  /** The active version's number; null until a version is ingested and activated. */
  currentVersion: string | null;
  status: RulesetStatus;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RulesetStatus = 'active' | 'inactive' | 'deprecated';

export const CLAUSE_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type ClauseSeverity = (typeof CLAUSE_SEVERITIES)[number];

/** A rule in its source's words, with where it comes from (see ClauseItemDto). */
export interface RulesetClause {
  id: string;
  title: string;
  content: string;
  order: number;
  is_required: boolean;
  article?: string;
  section?: string;
  severity?: ClauseSeverity;
  source_title?: string;
  source_url?: string;
  effective_date?: string;
  /** A paraphrase the model reads; never cited. */
  guidance?: string;
  metadata: Record<string, unknown>;
}

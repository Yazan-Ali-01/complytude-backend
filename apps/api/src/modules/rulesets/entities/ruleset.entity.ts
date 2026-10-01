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

export interface RulesetClause {
  id: string;
  title: string;
  content: string;
  order: number;
  is_required: boolean;
  metadata: Record<string, unknown>;
}

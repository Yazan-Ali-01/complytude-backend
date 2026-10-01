import { RulesetClause } from './ruleset.entity';

export interface RulesetVersion {
  id: string;
  rulesetId: string;
  version: string;
  clauses: RulesetClause[];
  changelog: string | null;
  /** Set when this row was created via rollback from this prior version string */
  rolledBackFromVersion: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  /** pending until the ingestion worker stores its chunks; only an ingested version can be activated. */
  ingestionStatus: RulesetIngestionState;
  chunkCount: number | null;
  ingestionError: string | null;
  ingestedAt: Date | null;
  /** D-9: draft until a legal review is recorded; production activates reviewed versions only. */
  reviewStatus: RulesetReviewStatus;
  reviewedBy: string | null;
  /** YYYY-MM-DD */
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export const RULESET_INGESTION_STATES = [
  'pending',
  'ingested',
  'failed',
] as const;
export type RulesetIngestionState = (typeof RULESET_INGESTION_STATES)[number];
export const RULESET_REVIEW_STATUSES = ['draft', 'reviewed'] as const;
export type RulesetReviewStatus = (typeof RULESET_REVIEW_STATUSES)[number];

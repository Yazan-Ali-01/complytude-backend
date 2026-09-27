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
}

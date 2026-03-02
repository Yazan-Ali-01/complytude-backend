import { RulesetClause } from './ruleset.entity';

export interface RulesetVersion {
  id: string;
  rulesetId: string;
  version: string;
  clauses: RulesetClause[];
  changelog: string | null;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
}

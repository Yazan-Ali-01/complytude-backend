export interface Ruleset {
  id: string;
  key: string;
  name: string;
  description: string | null;
  authorityId: string | null;
  currentVersion: string;
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

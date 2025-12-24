export type RulesetStatus = 'active' | 'inactive' | 'deprecated';

export interface Ruleset {
  id: string;
  key: string;
  name: string;
  description?: string;
  authority_id?: string;
  clauses: unknown[];
  metadata: Record<string, unknown>;
  version: string;
  status: RulesetStatus;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export type CreateRulesetInput = {
  key: string;
  name: string;
  description?: string;
  authority_id?: string;
  clauses: unknown[];
  metadata?: Record<string, unknown>;
  version?: string;
  status?: RulesetStatus;
  created_by?: string;
};

export type UpdateRulesetInput = Partial<{
  name: string;
  description: string;
  authority_id: string;
  clauses: unknown[];
  metadata: Record<string, unknown>;
  version: string;
  status: RulesetStatus;
  updated_at: Date;
}>;

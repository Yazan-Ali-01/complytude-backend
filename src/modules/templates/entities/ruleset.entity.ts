export interface Ruleset {
  id: string;
  key: string;
  name: string;
  description?: string;
  authority_id?: string;
  clauses: any[];
  metadata: Record<string, any>;
  version: string;
  status: 'active' | 'inactive' | 'deprecated';
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RulesetClause {
  id: string;
  title: string;
  content: string;
  order: number;
  is_required: boolean;
  metadata?: Record<string, any>;
}

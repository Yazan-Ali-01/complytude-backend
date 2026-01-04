export interface WorkspaceFeatures {
  document_limit: number;
  checklist_access: boolean;
  analyzer_enabled: boolean;
  [key: string]: any; // Allow additional custom features
}

export interface Workspace {
  id: string;
  workspace_id: string;
  email: string;
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: WorkspaceFeatures;
  created_at: Date;
  updated_at?: Date;
  is_active: boolean;
  schema_name: string; // Database schema for this workspace
}

export interface WorkspaceSchema {
  workspace_id: string;
  schema_name: string;
  created_at: Date;
  is_active: boolean;
}

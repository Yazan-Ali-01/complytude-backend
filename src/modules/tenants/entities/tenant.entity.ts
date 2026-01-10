export interface TenantFeatures {
  document_limit: number;
  checklist_access: boolean;
  analyzer_enabled: boolean;
  [key: string]: any; // Allow additional custom features
}

export interface Tenant {
  id: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: TenantFeatures;
  created_at: Date;
  updated_at: Date | null;
  is_active: boolean;
  schema_name: string; // Database schema for this tenant
}

export interface TenantSchema {
  tenant_id: string;
  schema_name: string;
  created_at: Date;
  is_active: boolean;
}

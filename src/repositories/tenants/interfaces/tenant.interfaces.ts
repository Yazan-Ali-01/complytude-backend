export interface TenantFeatures {
  document_limit: number;
  checklist_access: boolean;
  analyzer_enabled: boolean;
  // Allow custom feature flags/limits
  [key: string]: unknown;
}

export interface Tenant {
  id: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: TenantFeatures;
  schema_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TenantSchema {
  tenant_id: string;
  schema_name: string;
  is_active: boolean;
  created_at: Date;
}

export interface CreateTenantInput {
  id: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: TenantFeatures;
  schema_name: string;
  is_active?: boolean;
}

export interface UpdateTenantInput {
  email?: string;
  role?: 'admin' | 'user' | 'viewer';
  plan?: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features?: TenantFeatures;
  is_active?: boolean;
  updated_at?: Date;
}

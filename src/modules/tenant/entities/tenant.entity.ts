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
  updated_at?: Date;
  is_active: boolean;
  // Note: schema_name removed - using Pure RLS approach (all data in public schema)
}

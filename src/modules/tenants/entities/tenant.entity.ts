export interface TenantFeatures {
  document_limit: number;
  checklist_access: boolean;
  analyzer_enabled: boolean;
  [key: string]: any; // Allow additional custom features
}

export interface Tenant {
  id: string; // Primary key (UUID) - this IS the tenant identifier
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: TenantFeatures;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

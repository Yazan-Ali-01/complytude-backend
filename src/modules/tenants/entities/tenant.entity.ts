export type PlanType = 'navigator' | 'shield' | 'general_counsel' | 'infrastructure';

export interface TenantFeatures {
  // Document Generation
  documents_per_month: number;
  template_library: 'none' | 'basic' | 'full';
  bilingual_quality: 'none' | 'standard' | 'premium';

  // Contract Analysis
  contract_reviews_per_month: number;
  risk_analysis_level: 'none' | 'basic' | 'advanced' | 'comprehensive';
  redlining_enabled: boolean;
  localizer_check: boolean;

  // Regulatory Hub
  regulatory_hub_access: boolean;
  regulatory_queries_per_month: number;
  license_verifier_lookups: number;

  // Jurisdiction
  jurisdictions: string[];
  selected_jurisdiction: string;

  // Seats & Isolation
  user_seats: number;
  data_isolation: 'shared' | 'dedicated';
  custom_playbooks: boolean;
  white_label_exports: boolean;

  // Allow additional custom features
  [key: string]: any;
}

export interface Tenant {
  id: string;
  tenant_id: string;
  plan: PlanType;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UsageCheckResult {
  allowed: boolean;
  current_usage: number;
  usage_limit: number;
  remaining: number;
}

export interface UsageWithCreditsResult {
  allowed: boolean;
  source: 'quota' | 'credits' | 'none';
  current_usage: number;
  usage_limit: number;
  remaining_quota: number;
  credits_available: number;
}

export interface ActiveOverride {
  feature_key: string;
  override_value: any;
  expires_at: Date | null;
}

export interface FeatureOverride {
  id: string;
  tenant_id: string;
  feature_key: string;
  override_value: any;
  reason: string;
  granted_by: string;
  granted_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

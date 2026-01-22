export type PlanType = 'navigator' | 'shield' | 'general_counsel' | 'infrastructure';

export type FeatureDataType = 'boolean' | 'integer' | 'string' | 'array';
export type FeatureCategory = 'document_generation' | 'contract_analysis' | 'regulatory_hub' | 'jurisdiction' | 'seats_isolation';
export type FeatureValue = boolean | number | string | string[];

export interface FeatureDefinition {
  id: string;
  key: string;
  name: string;
  description?: string;
  data_type: FeatureDataType;
  category: FeatureCategory;
  default_value: FeatureValue;
  is_active: boolean;
}

export interface TenantFeatures {
  documents_per_month: number;
  template_library: 'none' | 'basic' | 'full';
  bilingual_quality: 'none' | 'standard' | 'premium';
  contract_reviews_per_month: number;
  risk_analysis_level: 'none' | 'basic' | 'advanced' | 'comprehensive';
  redlining_enabled: boolean;
  localizer_check: boolean;
  regulatory_hub_access: boolean;
  regulatory_queries_per_month: number;
  license_verifier_lookups: number;
  jurisdictions: string[];
  selected_jurisdiction: string;
  user_seats: number;
  data_isolation: 'shared' | 'dedicated';
  custom_playbooks: boolean;
  white_label_exports: boolean;
  [key: string]: FeatureValue;
}

export interface FeatureOverride {
  id: string;
  tenant_id: string;
  feature_key: string;
  override_value: FeatureValue;
  reason: string;
  granted_by: string;
  granted_at: Date;
  expires_at?: Date | null;
  revoked_at?: Date | null;
  revoked_by?: string | null;
  revoke_reason?: string | null;
}

export interface ActiveOverride {
  feature_key: string;
  override_value: FeatureValue;
  expires_at?: Date | null;
}

export interface UsageRecord {
  id: string;
  tenant_id: string;
  feature_key: string;
  billing_period_start: Date;
  billing_period_end: Date;
  current_usage: number;
  usage_limit: number;
  last_usage_at?: Date | null;
}

export interface UsageCheckResult {
  allowed: boolean;
  current_usage: number;
  usage_limit: number;
  remaining: number;
}

export interface UsageLogEntry {
  id: string;
  tenant_id: string;
  feature_key: string;
  action: 'increment' | 'decrement' | 'reset' | 'limit_change';
  previous_value: number;
  new_value: number;
  delta: number;
  user_id?: string | null;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface CreditBalance {
  tenant_id: string;
  feature_key: string;
  credits_remaining: number;
  updated_at: Date;
}

export interface CreditPurchase {
  id: string;
  tenant_id: string;
  feature_key: string;
  credits_purchased: number;
  price_aed: number;
  stripe_payment_intent_id?: string | null;
  stripe_invoice_id?: string | null;
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
  purchased_by?: string | null;
  purchased_at: Date;
  metadata?: Record<string, any>;
}

export interface CreditUsageLog {
  id: string;
  tenant_id: string;
  feature_key: string;
  credits_used: number;
  credits_before: number;
  credits_after: number;
  user_id?: string | null;
  reason?: string | null;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface UsageWithCreditsResult {
  allowed: boolean;
  source: 'quota' | 'credits' | 'none';
  current_usage: number;
  usage_limit: number;
  remaining_quota: number;
  credits_available: number;
}

export interface EffectiveFeature {
  key: string;
  value: FeatureValue;
  source: 'plan_default' | 'legacy_override' | 'db_override';
  expires_at?: Date | null;
}

export interface EffectiveFeaturesResponse {
  tenant_id: string;
  plan: PlanType;
  features: TenantFeatures;
  feature_sources: EffectiveFeature[];
  usage_summary: Record<string, UsageCheckResult>;
}

export interface Tenant {
  id?: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: PlanType;
  created_at?: Date;
  updated_at?: Date;
  is_active: boolean;
  schema_name: string;
}

export interface TenantSchema {
  tenant_id: string;
  schema_name: string;
  created_at: Date;
  is_active: boolean;
}

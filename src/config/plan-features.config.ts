import { TenantFeatures } from 'src/modules/tenants/entities/tenant-features.interface';
import {
  PlanTier,
  AnyPlanTier,
  normalizePlan,
  isLegacyPlan,
} from 'src/common/types/plans';

export const PLAN_FEATURES: Record<PlanTier, TenantFeatures> = {
  navigator: {
    documents_per_month: 5,
    template_library: 'essential',
    bilingual_quality: 'standard',
    contract_reviews_per_month: 0,
    risk_analysis_level: 'none',
    redlining_enabled: false,
    localizer_check: false,
    regulatory_hub_access: true,
    regulatory_queries_per_month: 10,
    license_verifier_lookups: 0,
    jurisdictions: 'single',
    selected_jurisdiction: null,
    user_seats: 1,
    data_isolation: 'row_level',
    custom_playbooks: false,
    white_label_exports: false,
    document_limit: 10,
    checklist_access: false,
    analyzer_enabled: false,
  },

  shield: {
    documents_per_month: 20,
    template_library: 'essential',
    bilingual_quality: 'standard',
    contract_reviews_per_month: 5,
    risk_analysis_level: 'critical_only',
    redlining_enabled: false,
    localizer_check: true,
    regulatory_hub_access: true,
    regulatory_queries_per_month: 30,
    license_verifier_lookups: 10,
    jurisdictions: 'single',
    selected_jurisdiction: null,
    user_seats: 3,
    data_isolation: 'row_level',
    custom_playbooks: false,
    white_label_exports: false,
    document_limit: 50,
    checklist_access: true,
    analyzer_enabled: false,
  },

  general_counsel: {
    documents_per_month: 100,
    template_library: 'full',
    bilingual_quality: 'jais_native',
    contract_reviews_per_month: 25,
    risk_analysis_level: 'full',
    redlining_enabled: true,
    localizer_check: true,
    regulatory_hub_access: true,
    regulatory_queries_per_month: 100,
    license_verifier_lookups: 50,
    jurisdictions: 'all',
    selected_jurisdiction: null,
    user_seats: 10,
    data_isolation: 'row_level',
    custom_playbooks: false,
    white_label_exports: false,
    document_limit: 500,
    checklist_access: true,
    analyzer_enabled: true,
  },

  infrastructure: {
    documents_per_month: -1,
    template_library: 'full',
    bilingual_quality: 'jais_native',
    contract_reviews_per_month: -1,
    risk_analysis_level: 'full',
    redlining_enabled: true,
    localizer_check: true,
    regulatory_hub_access: true,
    regulatory_queries_per_month: -1,
    license_verifier_lookups: -1,
    jurisdictions: 'all',
    selected_jurisdiction: null,
    user_seats: -1,
    data_isolation: 'silo',
    custom_playbooks: true,
    white_label_exports: true,
    document_limit: -1,
    checklist_access: true,
    analyzer_enabled: true,
  },
};

export function getDefaultPlanFeatures(plan: AnyPlanTier): TenantFeatures {
  const normalizedPlan = normalizePlan(plan);
  return { ...PLAN_FEATURES[normalizedPlan] };
}

export function isValidPlan(plan: string): plan is AnyPlanTier {
  return plan in PLAN_FEATURES || isLegacyPlan(plan);
}

export function getAllPlanTiers(): PlanTier[] {
  return ['navigator', 'shield', 'general_counsel', 'infrastructure'];
}

export type TemplateLibrary = 'essential' | 'full';

export type BilingualQuality = 'standard' | 'jais_native';

export type RiskAnalysisLevel = 'none' | 'critical_only' | 'full';

export type JurisdictionAccess = 'single' | 'all';

export type DataIsolation = 'shared' | 'row_level' | 'silo';

export type UAEJurisdiction =
  | 'mainland_dubai'
  | 'mainland_abu_dhabi'
  | 'difc'
  | 'adgm'
  | 'jafza'
  | 'dmcc'
  | 'dafza'
  | 'rakez'
  | 'shams'
  | 'spc'
  | 'other_free_zone';

export interface TenantFeatures {
  documents_per_month?: number;
  template_library?: TemplateLibrary;
  bilingual_quality?: BilingualQuality;
  contract_reviews_per_month?: number;
  risk_analysis_level?: RiskAnalysisLevel;
  redlining_enabled?: boolean;
  localizer_check?: boolean;
  regulatory_hub_access?: boolean;
  regulatory_queries_per_month?: number;
  license_verifier_lookups?: number;
  jurisdictions?: JurisdictionAccess;
  selected_jurisdiction?: UAEJurisdiction | null;
  user_seats?: number;
  data_isolation?: DataIsolation;
  custom_playbooks?: boolean;
  white_label_exports?: boolean;
  document_limit?: number;
  checklist_access?: boolean;
  analyzer_enabled?: boolean;
  [key: string]: unknown;
}

export const METERED_FEATURES = [
  'documents_per_month',
  'contract_reviews_per_month',
  'regulatory_queries_per_month',
  'license_verifier_lookups',
] as const;

export type MeteredFeature = (typeof METERED_FEATURES)[number];

export function isMeteredFeature(key: string): key is MeteredFeature {
  return METERED_FEATURES.includes(key as MeteredFeature);
}

export const FEATURE_CATEGORIES = {
  documents: ['documents_per_month', 'template_library', 'bilingual_quality'],
  contracts: [
    'contract_reviews_per_month',
    'risk_analysis_level',
    'redlining_enabled',
    'localizer_check',
  ],
  regulatory: [
    'regulatory_hub_access',
    'regulatory_queries_per_month',
    'license_verifier_lookups',
  ],
  jurisdiction: ['jurisdictions', 'selected_jurisdiction'],
  seats: [
    'user_seats',
    'data_isolation',
    'custom_playbooks',
    'white_label_exports',
  ],
} as const;

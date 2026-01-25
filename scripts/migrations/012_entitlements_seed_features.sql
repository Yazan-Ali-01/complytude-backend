BEGIN;

-- =========================
-- Migration 012: Seed Features Registry
-- =========================
-- Description: Populates the features table with all valid feature keys for the entitlements system
-- =========================

INSERT INTO public.features (key, data_type, category, display_name, description, enum_values, default_value, is_metered, sort_order)
VALUES
-- DOCUMENTS
('documents_per_month', 'number', 'documents', 'Documents Per Month',
 'Monthly document generation quota. -1 = unlimited.', NULL, '5', true, 100),
('template_library', 'enum', 'documents', 'Template Library',
 'Template library access level.', '["essential", "full"]', '"essential"', false, 110),
('bilingual_quality', 'enum', 'documents', 'Bilingual Quality',
 'Arabic/English document quality.', '["standard", "jais_native"]', '"standard"', false, 120),

-- CONTRACTS
('contract_reviews_per_month', 'number', 'contracts', 'Contract Reviews Per Month',
 'Monthly AI contract analysis quota. -1 = unlimited.', NULL, '0', true, 200),
('risk_analysis_level', 'enum', 'contracts', 'Risk Analysis Level',
 'Depth of contract risk analysis.', '["none", "critical_only", "full"]', '"none"', false, 210),
('redlining_enabled', 'boolean', 'contracts', 'AI Redlining',
 'AI suggests alternative compliant wording.', NULL, 'false', false, 220),
('localizer_check', 'boolean', 'contracts', 'Localizer Check',
 'Flags jurisdiction mismatches.', NULL, 'false', false, 230),

-- REGULATORY
('regulatory_hub_access', 'boolean', 'regulatory', 'Regulatory Hub Access',
 'Access to compliance dashboard.', NULL, 'true', false, 300),
('regulatory_queries_per_month', 'number', 'regulatory', 'Chat-with-Law Queries',
 'Monthly regulatory queries. -1 = unlimited.', NULL, '10', true, 310),
('license_verifier_lookups', 'number', 'regulatory', 'License Verifier Lookups',
 'Monthly DED API lookups. -1 = unlimited.', NULL, '0', true, 320),

-- JURISDICTION
('jurisdictions', 'enum', 'jurisdiction', 'Jurisdiction Access',
 'Single or all jurisdictions.', '["single", "all"]', '"single"', false, 400),
('selected_jurisdiction', 'string', 'jurisdiction', 'Selected Jurisdiction',
 'If single, which jurisdiction.', NULL, 'null', false, 410),

-- SEATS & ISOLATION
('user_seats', 'number', 'seats', 'User Seats',
 'Max users in tenant. -1 = unlimited.', NULL, '1', false, 500),
('data_isolation', 'enum', 'isolation', 'Data Isolation',
 'Data isolation level.', '["shared", "row_level", "silo"]', '"row_level"', false, 510),
('custom_playbooks', 'boolean', 'advanced', 'Custom Playbooks',
 'Upload company-specific positions.', NULL, 'false', false, 520),
('white_label_exports', 'boolean', 'advanced', 'White-Label Exports',
 'Export with tenant branding.', NULL, 'false', false, 530),

-- LEGACY
('document_limit', 'number', 'legacy', 'Document Limit (Legacy)',
 'DEPRECATED: Use documents_per_month.', NULL, '10', false, 900),
('checklist_access', 'boolean', 'legacy', 'Checklist Access (Legacy)',
 'DEPRECATED: Part of regulatory_hub_access.', NULL, 'false', false, 910),
('analyzer_enabled', 'boolean', 'legacy', 'Analyzer Enabled (Legacy)',
 'DEPRECATED: Use contract_reviews_per_month > 0.', NULL, 'false', false, 920);

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DELETE FROM public.features;
COMMIT;
*/
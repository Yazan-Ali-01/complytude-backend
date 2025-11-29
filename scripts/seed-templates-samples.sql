-- ============================================================================
-- Sample Data Script: Templates System Sample Data
-- ============================================================================
-- Description: Insert sample rulesets, templates, template versions, and associations
-- Usage: Run this script after seed-templates-data.sql to populate sample template data
-- Note: This script assumes storage files are already uploaded (uses placeholder URLs)
-- ============================================================================

-- Note: This script requires RLS to be bypassed. When running via psql, ensure you have proper permissions
-- or run with a user that has RLS bypass privileges. In application code, use SET app.bypass_rls = 'true'

-- ============================================================================
-- 1. INSERT RULESETS
-- ============================================================================

DO $$
DECLARE
    dmcc_id UUID;
    ifza_id UUID;
    ded_id UUID;
    rakez_id UUID;
    adgm_id UUID;
    difc_id UUID;
BEGIN
    -- Bypass RLS for seeding (required for templates tables)
    PERFORM set_config('app.bypass_rls', 'true', false);
    
    -- Get authority IDs
    SELECT id INTO dmcc_id FROM public.authorities WHERE code = 'DMCC';
    SELECT id INTO ifza_id FROM public.authorities WHERE code = 'IFZA';
    SELECT id INTO ded_id FROM public.authorities WHERE code = 'DED';
    SELECT id INTO rakez_id FROM public.authorities WHERE code = 'RAKEZ';
    SELECT id INTO adgm_id FROM public.authorities WHERE code = 'ADGM';
    SELECT id INTO difc_id FROM public.authorities WHERE code = 'DIFC';

    -- Insert rulesets (idempotent)
    INSERT INTO public.rulesets (key, name, description, authority_id, clauses, metadata, version, status) VALUES
        -- DMCC Rulesets
        ('dmcc_employment_labor_2024', 'DMCC Employment Labor Rules 2024', 'Labor law clauses for DMCC employment contracts', dmcc_id, 
         '[{"id": "dmcc_clause_1", "title": "Working Hours", "content": "Standard working hours shall not exceed 8 hours per day or 48 hours per week."}, {"id": "dmcc_clause_2", "title": "Annual Leave", "content": "Employee is entitled to 30 days of annual leave per year."}]'::jsonb,
         '{"effective_date": "2024-01-01", "authority": "DMCC"}'::jsonb, '1.0.0', 'active'),
        
        ('dmcc_freelance_terms_2024', 'DMCC Freelance Terms 2024', 'Standard terms for freelance agreements under DMCC', dmcc_id,
         '[{"id": "dmcc_freelance_1", "title": "Payment Terms", "content": "Payment shall be made within 30 days of invoice submission."}, {"id": "dmcc_freelance_2", "title": "Intellectual Property", "content": "All work products remain the property of the client unless otherwise specified."}]'::jsonb,
         '{"effective_date": "2024-01-01"}'::jsonb, '1.0.0', 'active'),

        -- IFZA Rulesets
        ('ifza_employment_standard_2024', 'IFZA Employment Standard Rules 2024', 'Standard employment rules for IFZA companies', ifza_id,
         '[{"id": "ifza_emp_1", "title": "Probation Period", "content": "Probation period shall not exceed 6 months."}, {"id": "ifza_emp_2", "title": "End of Service Benefits", "content": "End of service gratuity calculated as per UAE Labor Law."}]'::jsonb,
         '{"effective_date": "2024-01-01"}'::jsonb, '1.0.0', 'active'),

        ('ifza_commercial_standard_2024', 'IFZA Commercial Contract Rules 2024', 'Standard clauses for commercial agreements', ifza_id,
         '[{"id": "ifza_com_1", "title": "Governing Law", "content": "This agreement shall be governed by the laws of the UAE."}, {"id": "ifza_com_2", "title": "Dispute Resolution", "content": "Disputes shall be resolved through arbitration in accordance with UAE Arbitration Law."}]'::jsonb,
         '{"effective_date": "2024-01-01"}'::jsonb, '1.0.0', 'active'),

        -- DED Rulesets
        ('ded_mainland_employment_2024', 'DED Mainland Employment Rules 2024', 'Employment rules for DED mainland companies', ded_id,
         '[{"id": "ded_emp_1", "title": "Work Permit Requirements", "content": "Employee must hold valid work permit and labor card."}, {"id": "ded_emp_2", "title": "Notice Period", "content": "Notice period shall be 30 days for unlimited contracts."}]'::jsonb,
         '{"effective_date": "2024-01-01"}'::jsonb, '1.0.0', 'active'),

        -- RAKEZ Rulesets
        ('rakez_service_agreement_2024', 'RAKEZ Service Agreement Rules 2024', 'Standard service agreement clauses for RAKEZ', rakez_id,
         '[{"id": "rakez_service_1", "title": "Service Scope", "content": "Service provider shall deliver services as described in the attached scope of work."}, {"id": "rakez_service_2", "title": "Termination", "content": "Either party may terminate this agreement with 30 days written notice."}]'::jsonb,
         '{"effective_date": "2024-01-01"}'::jsonb, '1.0.0', 'active'),

        -- ADGM Rulesets
        ('adgm_consultancy_standard_2024', 'ADGM Consultancy Rules 2024', 'Standard consultancy agreement clauses', adgm_id,
         '[{"id": "adgm_consult_1", "title": "Confidentiality", "content": "Consultant shall maintain strict confidentiality of all client information."}, {"id": "adgm_consult_2", "title": "Independent Contractor", "content": "Consultant is an independent contractor and not an employee of the client."}]'::jsonb,
         '{"effective_date": "2024-01-01"}'::jsonb, '1.0.0', 'active'),

        -- DIFC Rulesets
        ('difc_nda_standard_2024', 'DIFC NDA Standard Rules 2024', 'Standard non-disclosure agreement clauses for DIFC', difc_id,
         '[{"id": "difc_nda_1", "title": "Definition of Confidential Information", "content": "Confidential information includes all proprietary data, business plans, and trade secrets."}, {"id": "difc_nda_2", "title": "Duration", "content": "Confidentiality obligations shall survive for 5 years after termination of this agreement."}]'::jsonb,
         '{"effective_date": "2024-01-01"}'::jsonb, '1.0.0', 'active')
    ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        clauses = EXCLUDED.clauses,
        metadata = EXCLUDED.metadata,
        version = EXCLUDED.version,
        updated_at = CURRENT_TIMESTAMP;
END $$;

-- ============================================================================
-- 2. INSERT TEMPLATES
-- ============================================================================

DO $$
DECLARE
    -- Category IDs
    employment_cat_id UUID;
    freelance_cat_id UUID;
    commercial_cat_id UUID;
    service_cat_id UUID;
    consultancy_cat_id UUID;
    nda_cat_id UUID;
    
    -- Authority IDs
    dmcc_id UUID;
    ifza_id UUID;
    ded_id UUID;
    rakez_id UUID;
    adgm_id UUID;
    difc_id UUID;
    
    -- Template IDs (will be populated)
    template1_id UUID;
    template2_id UUID;
    template3_id UUID;
    template4_id UUID;
    template5_id UUID;
    template6_id UUID;
    template7_id UUID;
    template8_id UUID;
BEGIN
    -- Bypass RLS for seeding
    PERFORM set_config('app.bypass_rls', 'true', false);
    
    -- Get category IDs
    SELECT id INTO employment_cat_id FROM public.categories WHERE code = 'employment';
    SELECT id INTO freelance_cat_id FROM public.categories WHERE code = 'freelance';
    SELECT id INTO commercial_cat_id FROM public.categories WHERE code = 'commercial';
    SELECT id INTO service_cat_id FROM public.categories WHERE code = 'service';
    SELECT id INTO consultancy_cat_id FROM public.categories WHERE code = 'consultancy';
    SELECT id INTO nda_cat_id FROM public.categories WHERE code = 'nda';

    -- Get authority IDs
    SELECT id INTO dmcc_id FROM public.authorities WHERE code = 'DMCC';
    SELECT id INTO ifza_id FROM public.authorities WHERE code = 'IFZA';
    SELECT id INTO ded_id FROM public.authorities WHERE code = 'DED';
    SELECT id INTO rakez_id FROM public.authorities WHERE code = 'RAKEZ';
    SELECT id INTO adgm_id FROM public.authorities WHERE code = 'ADGM';
    SELECT id INTO difc_id FROM public.authorities WHERE code = 'DIFC';

    -- Insert templates (idempotent) - using placeholder S3 URLs
    INSERT INTO public.templates (key, name, description, category_id, authority_id, languages, current_version, status, file_url, thumbnail_url, metadata) VALUES
        ('dmcc_employment_contract_v1', 'DMCC Employment Contract', 'Standard employment contract for DMCC companies', employment_cat_id, dmcc_id, 
         ARRAY['en', 'ar'], '1.0.0', 'active', 
         'https://s3.example.com/templates/dmcc_employment_contract_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/dmcc_employment_contract_v1.png',
         '{"template_type": "employment", "authority": "DMCC", "language_support": ["en", "ar"]}'::jsonb),
        
        ('dmcc_freelance_agreement_v1', 'DMCC Freelance Agreement', 'Standard freelance service agreement for DMCC', freelance_cat_id, dmcc_id,
         ARRAY['en'], '1.0.0', 'active',
         'https://s3.example.com/templates/dmcc_freelance_agreement_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/dmcc_freelance_agreement_v1.png',
         '{"template_type": "freelance"}'::jsonb),

        ('ifza_employment_standard_v1', 'IFZA Standard Employment Contract', 'Standard employment contract for IFZA companies', employment_cat_id, ifza_id,
         ARRAY['en', 'ar'], '1.0.0', 'active',
         'https://s3.example.com/templates/ifza_employment_standard_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/ifza_employment_standard_v1.png',
         '{"template_type": "employment"}'::jsonb),

        ('ifza_commercial_contract_v1', 'IFZA Commercial Contract', 'Standard commercial agreement template for IFZA', commercial_cat_id, ifza_id,
         ARRAY['en'], '1.0.0', 'active',
         'https://s3.example.com/templates/ifza_commercial_contract_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/ifza_commercial_contract_v1.png',
         '{"template_type": "commercial"}'::jsonb),

        ('ded_mainland_employment_v1', 'DED Mainland Employment Contract', 'Employment contract for DED mainland companies', employment_cat_id, ded_id,
         ARRAY['en', 'ar'], '1.0.0', 'active',
         'https://s3.example.com/templates/ded_mainland_employment_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/ded_mainland_employment_v1.png',
         '{"template_type": "employment", "jurisdiction": "mainland"}'::jsonb),

        ('rakez_service_agreement_v1', 'RAKEZ Service Agreement', 'Standard service agreement for RAKEZ companies', service_cat_id, rakez_id,
         ARRAY['en'], '1.0.0', 'active',
         'https://s3.example.com/templates/rakez_service_agreement_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/rakez_service_agreement_v1.png',
         '{"template_type": "service"}'::jsonb),

        ('adgm_consultancy_agreement_v1', 'ADGM Consultancy Agreement', 'Standard consultancy agreement for ADGM', consultancy_cat_id, adgm_id,
         ARRAY['en'], '1.0.0', 'active',
         'https://s3.example.com/templates/adgm_consultancy_agreement_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/adgm_consultancy_agreement_v1.png',
         '{"template_type": "consultancy"}'::jsonb),

        ('difc_nda_standard_v1', 'DIFC Standard NDA', 'Standard non-disclosure agreement for DIFC entities', nda_cat_id, difc_id,
         ARRAY['en'], '1.0.0', 'active',
         'https://s3.example.com/templates/difc_nda_standard_v1.0.0.docx',
         'https://s3.example.com/templates/thumbnails/difc_nda_standard_v1.png',
         '{"template_type": "nda"}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        file_url = EXCLUDED.file_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP;

    -- Get template IDs for versions and rulesets
    SELECT id INTO template1_id FROM public.templates WHERE key = 'dmcc_employment_contract_v1';
    SELECT id INTO template2_id FROM public.templates WHERE key = 'dmcc_freelance_agreement_v1';
    SELECT id INTO template3_id FROM public.templates WHERE key = 'ifza_employment_standard_v1';
    SELECT id INTO template4_id FROM public.templates WHERE key = 'ifza_commercial_contract_v1';
    SELECT id INTO template5_id FROM public.templates WHERE key = 'ded_mainland_employment_v1';
    SELECT id INTO template6_id FROM public.templates WHERE key = 'rakez_service_agreement_v1';
    SELECT id INTO template7_id FROM public.templates WHERE key = 'adgm_consultancy_agreement_v1';
    SELECT id INTO template8_id FROM public.templates WHERE key = 'difc_nda_standard_v1';

    -- ============================================================================
    -- 3. INSERT TEMPLATE VERSIONS
    -- ============================================================================

    -- Insert template versions with field definitions
    INSERT INTO public.template_versions (template_id, version, fields, file_url, changelog, metadata, is_active) VALUES
        -- DMCC Employment Contract v1.0.0
        (template1_id, '1.0.0', 
         '[
            {"key": "employee_name", "label": "Employee Full Name", "type": "text", "required": true, "placeholder": "John Doe", "order": 1},
            {"key": "employee_id", "label": "Employee ID/Passport", "type": "text", "required": true, "order": 2},
            {"key": "job_title", "label": "Job Title", "type": "text", "required": true, "order": 3},
            {"key": "start_date", "label": "Employment Start Date", "type": "date", "required": true, "order": 4},
            {"key": "salary", "label": "Monthly Salary (AED)", "type": "number", "required": true, "validation_rules": {"min": 0}, "order": 5},
            {"key": "contract_type", "label": "Contract Type", "type": "select", "required": true, "options": [{"label": "Limited", "value": "limited"}, {"label": "Unlimited", "value": "unlimited"}], "order": 6},
            {"key": "probation_period", "label": "Probation Period (months)", "type": "number", "required": false, "default_value": 3, "validation_rules": {"min": 0, "max": 6}, "order": 7},
            {"key": "work_location", "label": "Work Location", "type": "text", "required": true, "order": 8},
            {"key": "working_hours", "label": "Working Hours per Week", "type": "number", "required": true, "default_value": 48, "validation_rules": {"min": 0, "max": 60}, "order": 9},
            {"key": "annual_leave", "label": "Annual Leave Days", "type": "number", "required": true, "default_value": 30, "order": 10}
         ]'::jsonb,
         'https://s3.example.com/templates/dmcc_employment_contract_v1.0.0.docx',
         'Initial version - DMCC employment contract template',
         '{"created_by": "system", "approval_status": "approved"}'::jsonb, true),

        -- DMCC Freelance Agreement v1.0.0
        (template2_id, '1.0.0',
         '[
            {"key": "freelancer_name", "label": "Freelancer Name", "type": "text", "required": true, "order": 1},
            {"key": "client_name", "label": "Client Company Name", "type": "text", "required": true, "order": 2},
            {"key": "project_description", "label": "Project Description", "type": "textarea", "required": true, "order": 3},
            {"key": "start_date", "label": "Project Start Date", "type": "date", "required": true, "order": 4},
            {"key": "end_date", "label": "Project End Date", "type": "date", "required": false, "order": 5},
            {"key": "payment_amount", "label": "Total Payment (AED)", "type": "number", "required": true, "validation_rules": {"min": 0}, "order": 6},
            {"key": "payment_terms", "label": "Payment Terms", "type": "select", "required": true, "options": [{"label": "30 days", "value": "30"}, {"label": "60 days", "value": "60"}, {"label": "Net 15", "value": "15"}], "default_value": "30", "order": 7},
            {"key": "deliverables", "label": "Deliverables", "type": "textarea", "required": true, "order": 8}
         ]'::jsonb,
         'https://s3.example.com/templates/dmcc_freelance_agreement_v1.0.0.docx',
         'Initial version - DMCC freelance agreement',
         '{}'::jsonb, true),

        -- IFZA Employment Contract v1.0.0
        (template3_id, '1.0.0',
         '[
            {"key": "employee_name", "label": "Employee Full Name", "type": "text", "required": true, "order": 1},
            {"key": "employee_passport", "label": "Passport Number", "type": "text", "required": true, "order": 2},
            {"key": "job_title", "label": "Job Title", "type": "text", "required": true, "order": 3},
            {"key": "department", "label": "Department", "type": "text", "required": true, "order": 4},
            {"key": "start_date", "label": "Employment Start Date", "type": "date", "required": true, "order": 5},
            {"key": "salary", "label": "Monthly Salary (AED)", "type": "number", "required": true, "validation_rules": {"min": 0}, "order": 6},
            {"key": "probation_period", "label": "Probation Period (months)", "type": "number", "required": false, "default_value": 6, "validation_rules": {"min": 0, "max": 6}, "order": 7}
         ]'::jsonb,
         'https://s3.example.com/templates/ifza_employment_standard_v1.0.0.docx',
         'Initial version - IFZA employment contract',
         '{}'::jsonb, true),

        -- IFZA Commercial Contract v1.0.0
        (template4_id, '1.0.0',
         '[
            {"key": "party_a_name", "label": "Party A Company Name", "type": "text", "required": true, "order": 1},
            {"key": "party_b_name", "label": "Party B Company Name", "type": "text", "required": true, "order": 2},
            {"key": "contract_value", "label": "Contract Value (AED)", "type": "number", "required": true, "validation_rules": {"min": 0}, "order": 3},
            {"key": "effective_date", "label": "Effective Date", "type": "date", "required": true, "order": 4},
            {"key": "termination_date", "label": "Termination Date", "type": "date", "required": false, "order": 5},
            {"key": "governing_law", "label": "Governing Law", "type": "select", "required": true, "options": [{"label": "UAE Federal Law", "value": "uae_federal"}, {"label": "DIFC Law", "value": "difc"}], "default_value": "uae_federal", "order": 6}
         ]'::jsonb,
         'https://s3.example.com/templates/ifza_commercial_contract_v1.0.0.docx',
         'Initial version - IFZA commercial contract',
         '{}'::jsonb, true),

        -- DED Mainland Employment v1.0.0
        (template5_id, '1.0.0',
         '[
            {"key": "employee_name", "label": "Employee Full Name", "type": "text", "required": true, "order": 1},
            {"key": "nationality", "label": "Nationality", "type": "text", "required": true, "order": 2},
            {"key": "job_title", "label": "Job Title", "type": "text", "required": true, "order": 3},
            {"key": "start_date", "label": "Employment Start Date", "type": "date", "required": true, "order": 4},
            {"key": "salary", "label": "Monthly Salary (AED)", "type": "number", "required": true, "validation_rules": {"min": 0}, "order": 5},
            {"key": "work_permit_number", "label": "Work Permit Number", "type": "text", "required": true, "order": 6},
            {"key": "labor_card_number", "label": "Labor Card Number", "type": "text", "required": true, "order": 7},
            {"key": "notice_period", "label": "Notice Period (days)", "type": "number", "required": true, "default_value": 30, "order": 8}
         ]'::jsonb,
         'https://s3.example.com/templates/ded_mainland_employment_v1.0.0.docx',
         'Initial version - DED mainland employment contract',
         '{}'::jsonb, true),

        -- RAKEZ Service Agreement v1.0.0
        (template6_id, '1.0.0',
         '[
            {"key": "service_provider", "label": "Service Provider Name", "type": "text", "required": true, "order": 1},
            {"key": "client_name", "label": "Client Name", "type": "text", "required": true, "order": 2},
            {"key": "service_description", "label": "Service Description", "type": "textarea", "required": true, "order": 3},
            {"key": "service_fee", "label": "Service Fee (AED)", "type": "number", "required": true, "validation_rules": {"min": 0}, "order": 4},
            {"key": "start_date", "label": "Service Start Date", "type": "date", "required": true, "order": 5},
            {"key": "end_date", "label": "Service End Date", "type": "date", "required": false, "order": 6},
            {"key": "payment_schedule", "label": "Payment Schedule", "type": "select", "required": true, "options": [{"label": "Monthly", "value": "monthly"}, {"label": "Quarterly", "value": "quarterly"}, {"label": "One-time", "value": "onetime"}], "order": 7}
         ]'::jsonb,
         'https://s3.example.com/templates/rakez_service_agreement_v1.0.0.docx',
         'Initial version - RAKEZ service agreement',
         '{}'::jsonb, true),

        -- ADGM Consultancy Agreement v1.0.0
        (template7_id, '1.0.0',
         '[
            {"key": "consultant_name", "label": "Consultant Name/Company", "type": "text", "required": true, "order": 1},
            {"key": "client_name", "label": "Client Name", "type": "text", "required": true, "order": 2},
            {"key": "consultancy_scope", "label": "Consultancy Scope", "type": "textarea", "required": true, "order": 3},
            {"key": "consultancy_fee", "label": "Consultancy Fee (AED)", "type": "number", "required": true, "validation_rules": {"min": 0}, "order": 4},
            {"key": "start_date", "label": "Start Date", "type": "date", "required": true, "order": 5},
            {"key": "duration_months", "label": "Duration (months)", "type": "number", "required": false, "order": 6},
            {"key": "confidentiality_required", "label": "Confidentiality Required", "type": "boolean", "required": true, "default_value": true, "order": 7}
         ]'::jsonb,
         'https://s3.example.com/templates/adgm_consultancy_agreement_v1.0.0.docx',
         'Initial version - ADGM consultancy agreement',
         '{}'::jsonb, true),

        -- DIFC NDA v1.0.0
        (template8_id, '1.0.0',
         '[
            {"key": "disclosing_party", "label": "Disclosing Party Name", "type": "text", "required": true, "order": 1},
            {"key": "receiving_party", "label": "Receiving Party Name", "type": "text", "required": true, "order": 2},
            {"key": "purpose", "label": "Purpose of Disclosure", "type": "textarea", "required": true, "order": 3},
            {"key": "effective_date", "label": "Effective Date", "type": "date", "required": true, "order": 4},
            {"key": "duration_years", "label": "Confidentiality Duration (years)", "type": "number", "required": true, "default_value": 5, "validation_rules": {"min": 1, "max": 10}, "order": 5},
            {"key": "confidential_info_description", "label": "Description of Confidential Information", "type": "textarea", "required": true, "order": 6}
         ]'::jsonb,
         'https://s3.example.com/templates/difc_nda_standard_v1.0.0.docx',
         'Initial version - DIFC standard NDA',
         '{}'::jsonb, true)
    ON CONFLICT (template_id, version) DO UPDATE SET
        fields = EXCLUDED.fields,
        file_url = EXCLUDED.file_url,
        changelog = EXCLUDED.changelog,
        metadata = EXCLUDED.metadata;

    -- ============================================================================
    -- 4. LINK TEMPLATES TO RULESETS (Many-to-Many)
    -- ============================================================================

    -- Link templates to their corresponding rulesets
    INSERT INTO public.template_rulesets (template_id, ruleset_id) VALUES
        -- DMCC Employment Contract -> DMCC Employment Rules
        (template1_id, (SELECT id FROM public.rulesets WHERE key = 'dmcc_employment_labor_2024')),
        -- DMCC Freelance Agreement -> DMCC Freelance Terms
        (template2_id, (SELECT id FROM public.rulesets WHERE key = 'dmcc_freelance_terms_2024')),
        -- IFZA Employment -> IFZA Employment Rules
        (template3_id, (SELECT id FROM public.rulesets WHERE key = 'ifza_employment_standard_2024')),
        -- IFZA Commercial -> IFZA Commercial Rules
        (template4_id, (SELECT id FROM public.rulesets WHERE key = 'ifza_commercial_standard_2024')),
        -- DED Employment -> DED Employment Rules
        (template5_id, (SELECT id FROM public.rulesets WHERE key = 'ded_mainland_employment_2024')),
        -- RAKEZ Service -> RAKEZ Service Rules
        (template6_id, (SELECT id FROM public.rulesets WHERE key = 'rakez_service_agreement_2024')),
        -- ADGM Consultancy -> ADGM Consultancy Rules
        (template7_id, (SELECT id FROM public.rulesets WHERE key = 'adgm_consultancy_standard_2024')),
        -- DIFC NDA -> DIFC NDA Rules
        (template8_id, (SELECT id FROM public.rulesets WHERE key = 'difc_nda_standard_2024'))
    ON CONFLICT (template_id, ruleset_id) DO NOTHING;
END $$;

-- ============================================================================
-- SUCCESS NOTIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Templates sample data seeded with:';
    RAISE NOTICE '   - % rulesets', (SELECT COUNT(*) FROM public.rulesets);
    RAISE NOTICE '   - % templates', (SELECT COUNT(*) FROM public.templates);
    RAISE NOTICE '   - % template versions', (SELECT COUNT(*) FROM public.template_versions);
    RAISE NOTICE '   - % template-ruleset links', (SELECT COUNT(*) FROM public.template_rulesets);
END $$;


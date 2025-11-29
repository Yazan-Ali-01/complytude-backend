-- ============================================================================
-- Seed Script: Templates System Initial Data
-- ============================================================================
-- Description: Insert initial authorities and categories for template system
-- Usage: Run this script after 003_init_templates.sql migration
-- Note: For sample templates data, see seed-templates-samples.sql
-- ============================================================================

-- Insert authorities (idempotent - won't insert duplicates)
INSERT INTO public.authorities (code, name, description, country, is_active) VALUES
    ('DMCC', 'Dubai Multi Commodities Centre', 'Dubai free zone authority for commodities trading', 'UAE', true),
    ('IFZA', 'International Free Zone Authority', 'Fujairah free zone authority', 'UAE', true),
    ('DED', 'Department of Economic Development', 'Dubai mainland business authority', 'UAE', true),
    ('RAKEZ', 'Ras Al Khaimah Economic Zone', 'RAK free zone authority', 'UAE', true),
    ('ADGM', 'Abu Dhabi Global Market', 'Abu Dhabi financial free zone', 'UAE', true),
    ('DIFC', 'Dubai International Financial Centre', 'Dubai financial free zone', 'UAE', true),
    ('SHAMS', 'Sharjah Media City', 'Sharjah free zone for media and creative industries', 'UAE', true),
    ('JAFZA', 'Jebel Ali Free Zone Authority', 'Dubai logistics and trade free zone', 'UAE', true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

-- Insert categories (idempotent - won't insert duplicates)
INSERT INTO public.categories (code, name, description, parent_id, is_active) VALUES
    ('employment', 'Employment Contracts', 'Employment and labor agreements', NULL, true),
    ('freelance', 'Freelance Agreements', 'Independent contractor and freelance contracts', NULL, true),
    ('commercial', 'Commercial Contracts', 'Business-to-business commercial agreements', NULL, true),
    ('lease', 'Lease Agreements', 'Property and equipment lease contracts', NULL, true),
    ('service', 'Service Agreements', 'Service provider contracts', NULL, true),
    ('nda', 'Non-Disclosure Agreements', 'Confidentiality and NDA contracts', NULL, true),
    ('partnership', 'Partnership Agreements', 'Business partnership contracts', NULL, true),
    ('sales', 'Sales Agreements', 'Purchase and sales contracts', NULL, true),
    ('consultancy', 'Consultancy Agreements', 'Consulting and advisory contracts', NULL, true),
    ('license', 'License Agreements', 'Licensing and intellectual property agreements', NULL, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '✅ Templates system seeded with:';
    RAISE NOTICE '   - % authorities', (SELECT COUNT(*) FROM public.authorities);
    RAISE NOTICE '   - % categories', (SELECT COUNT(*) FROM public.categories);
END $$;


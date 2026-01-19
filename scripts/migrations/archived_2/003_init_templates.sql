-- ============================================================================
-- Migration 003: Template Management System (Pure RLS)
-- ============================================================================
-- Description: Template CMS for legal documents with versioning and rulesets
-- Dependencies: 001_init_multi_tenancy.sql, 002_init_auth.sql
-- ============================================================================

-- Create UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. AUTHORITIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.authorities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    country VARCHAR(100) DEFAULT 'UAE',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_authorities_code ON public.authorities(code);
CREATE INDEX IF NOT EXISTS idx_authorities_is_active ON public.authorities(is_active);

COMMENT ON TABLE public.authorities IS 'Legal authorities (DMCC, IFZA, DED, RAKEZ, etc.)';
COMMENT ON COLUMN public.authorities.code IS 'Unique authority code (e.g., DMCC, IFZA)';

-- ============================================================================
-- 2. CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_code ON public.categories(code);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);

COMMENT ON TABLE public.categories IS 'Template categories (Employment, Freelance, Commercial, etc.)';
COMMENT ON COLUMN public.categories.parent_id IS 'For hierarchical categories (optional)';

-- ============================================================================
-- 3. RULESETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rulesets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    authority_id UUID REFERENCES public.authorities(id) ON DELETE CASCADE,
    clauses JSONB NOT NULL DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    created_by VARCHAR(255) REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rulesets_key ON public.rulesets(key);
CREATE INDEX IF NOT EXISTS idx_rulesets_authority_id ON public.rulesets(authority_id);
CREATE INDEX IF NOT EXISTS idx_rulesets_status ON public.rulesets(status);
CREATE INDEX IF NOT EXISTS idx_rulesets_created_by ON public.rulesets(created_by);

COMMENT ON TABLE public.rulesets IS 'Legal rulesets containing authority-specific clauses';
COMMENT ON COLUMN public.rulesets.clauses IS 'Array of legal clauses/rules in JSONB format';
COMMENT ON COLUMN public.rulesets.metadata IS 'Additional metadata about the ruleset';

-- ============================================================================
-- 4. TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    authority_id UUID REFERENCES public.authorities(id) ON DELETE SET NULL,
    languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
    current_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft', 'deprecated')),
    file_url TEXT,
    thumbnail_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(255) REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_key ON public.templates(key);
CREATE INDEX IF NOT EXISTS idx_templates_category_id ON public.templates(category_id);
CREATE INDEX IF NOT EXISTS idx_templates_authority_id ON public.templates(authority_id);
CREATE INDEX IF NOT EXISTS idx_templates_status ON public.templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON public.templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_languages ON public.templates USING GIN(languages);

COMMENT ON TABLE public.templates IS 'Template metadata - main template registry';
COMMENT ON COLUMN public.templates.key IS 'Unique template identifier (e.g., dmcc_employment_v1)';
COMMENT ON COLUMN public.templates.current_version IS 'Current active version number';
COMMENT ON COLUMN public.templates.file_url IS 'S3 URL to current version DOCX file';
COMMENT ON COLUMN public.templates.languages IS 'Supported languages: en, ar, bilingual';

-- ============================================================================
-- 5. TEMPLATE VERSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.template_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]',
    file_url TEXT NOT NULL,
    changelog TEXT,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(255) REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON public.template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_version ON public.template_versions(version);
CREATE INDEX IF NOT EXISTS idx_template_versions_is_active ON public.template_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_template_versions_created_by ON public.template_versions(created_by);

COMMENT ON TABLE public.template_versions IS 'Version history for templates - immutable audit trail';
COMMENT ON COLUMN public.template_versions.fields IS 'Field definitions for this version (JSONB array)';
COMMENT ON COLUMN public.template_versions.file_url IS 'S3 URL to this version DOCX file';
COMMENT ON COLUMN public.template_versions.is_active IS 'Whether this version is currently active';

-- ============================================================================
-- 6. TEMPLATE RULESETS (Many-to-Many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.template_rulesets (
    template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
    ruleset_id UUID NOT NULL REFERENCES public.rulesets(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (template_id, ruleset_id)
);

CREATE INDEX IF NOT EXISTS idx_template_rulesets_template_id ON public.template_rulesets(template_id);
CREATE INDEX IF NOT EXISTS idx_template_rulesets_ruleset_id ON public.template_rulesets(ruleset_id);

COMMENT ON TABLE public.template_rulesets IS 'Many-to-many relationship between templates and rulesets';

-- ============================================================================
-- 7. TRIGGERS FOR AUTO-UPDATING TIMESTAMPS
-- ============================================================================

CREATE TRIGGER update_authorities_updated_at
    BEFORE UPDATE ON public.authorities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rulesets_updated_at
    BEFORE UPDATE ON public.rulesets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON public.templates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on templates tables
ALTER TABLE public.authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rulesets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS templates_read_policy ON public.templates;
DROP POLICY IF EXISTS templates_write_policy ON public.templates;
DROP POLICY IF EXISTS authorities_read_policy ON public.authorities;
DROP POLICY IF EXISTS categories_read_policy ON public.categories;
DROP POLICY IF EXISTS rulesets_read_policy ON public.rulesets;
DROP POLICY IF EXISTS template_versions_read_policy ON public.template_versions;
DROP POLICY IF EXISTS template_versions_write_policy ON public.template_versions;

-- Read policies: All authenticated users can read
CREATE POLICY templates_read_policy ON public.templates
    FOR SELECT
    USING (true);

CREATE POLICY authorities_read_policy ON public.authorities
    FOR SELECT
    USING (true);

CREATE POLICY categories_read_policy ON public.categories
    FOR SELECT
    USING (true);

CREATE POLICY rulesets_read_policy ON public.rulesets
    FOR SELECT
    USING (true);

CREATE POLICY template_versions_read_policy ON public.template_versions
    FOR SELECT
    USING (true);

-- Write policies: Only system admins can write (enforced by bypass_rls)
CREATE POLICY templates_write_policy ON public.templates
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY rulesets_write_policy ON public.rulesets
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY authorities_write_policy ON public.authorities
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY categories_write_policy ON public.categories
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY template_versions_write_policy ON public.template_versions
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- ============================================================================
-- 9. SEED INITIAL DATA
-- ============================================================================

-- Seed authorities
INSERT INTO public.authorities (code, name, description, country) VALUES
    ('DMCC', 'Dubai Multi Commodities Centre', 'Dubai free zone authority for commodities trading', 'UAE'),
    ('IFZA', 'International Free Zone Authority', 'Fujairah free zone authority', 'UAE'),
    ('DED', 'Department of Economic Development', 'Dubai mainland business authority', 'UAE'),
    ('RAKEZ', 'Ras Al Khaimah Economic Zone', 'RAK free zone authority', 'UAE'),
    ('ADGM', 'Abu Dhabi Global Market', 'Abu Dhabi financial free zone', 'UAE'),
    ('DIFC', 'Dubai International Financial Centre', 'Dubai financial free zone', 'UAE')
ON CONFLICT (code) DO NOTHING;

-- Seed categories
INSERT INTO public.categories (code, name, description) VALUES
    ('employment', 'Employment Contracts', 'Employment and labor agreements'),
    ('freelance', 'Freelance Agreements', 'Independent contractor and freelance contracts'),
    ('commercial', 'Commercial Contracts', 'Business-to-business commercial agreements'),
    ('lease', 'Lease Agreements', 'Property and equipment lease contracts'),
    ('service', 'Service Agreements', 'Service provider contracts'),
    ('nda', 'Non-Disclosure Agreements', 'Confidentiality and NDA contracts'),
    ('partnership', 'Partnership Agreements', 'Business partnership contracts')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 10. HELPER FUNCTION: Update Template Version
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_template_current_version()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new version is created or updated to active, update the template's current_version
    -- SECURITY DEFINER allows this function to bypass RLS policies
    IF NEW.is_active = true THEN
        UPDATE public.templates
        SET current_version = NEW.version,
            file_url = NEW.file_url,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.template_id;
        
        RAISE NOTICE 'Updated template % to version %', NEW.template_id, NEW.version;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER trigger_update_template_version
    AFTER INSERT OR UPDATE ON public.template_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_template_current_version();

-- ============================================================================
-- 11. PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.authorities TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_versions TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rulesets TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_rulesets TO CURRENT_USER;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 003: Template Management System initialized';
    RAISE NOTICE '   - Created tables: authorities, categories, templates, template_versions, rulesets, template_rulesets';
    RAISE NOTICE '   - Created indexes and constraints';
    RAISE NOTICE '   - Configured RLS policies';
    RAISE NOTICE '   - Seeded initial authorities and categories';
END $$;

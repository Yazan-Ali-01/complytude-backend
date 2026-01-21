BEGIN;

-- =========================
-- Migration 006: Global Tables (Authorities, Categories, Rulesets, Templates)
-- =========================
-- Description: Global reference tables for legal authorities, categories, rulesets, and templates with versioning
-- No RLS - app layer handles authorization (system admin only for writes)
-- =========================

-- =========================
-- ENUMS
-- =========================

CREATE TYPE template_status AS ENUM ('active', 'inactive', 'draft', 'deprecated');
CREATE TYPE ruleset_status AS ENUM ('active', 'inactive', 'deprecated');

-- =========================
-- AUTHORITIES TABLE
-- =========================

CREATE TABLE public.authorities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(50) UNIQUE NOT NULL,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    country       VARCHAR(100) DEFAULT 'UAE',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.authorities IS 'Legal authorities (DMCC, IFZA, DED, RAKEZ, etc.) - global reference data';
COMMENT ON COLUMN public.authorities.code IS 'Unique authority code (e.g., DMCC, IFZA)';
COMMENT ON COLUMN public.authorities.country IS 'Country where authority operates';

-- =========================
-- CATEGORIES TABLE
-- =========================

CREATE TABLE public.categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(50) UNIQUE NOT NULL,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    parent_id     UUID,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_categories_parent
        FOREIGN KEY (parent_id)
        REFERENCES public.categories(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.categories IS 'Template categories with hierarchical support (employment, freelance, commercial, etc.)';
COMMENT ON COLUMN public.categories.parent_id IS 'Parent category for hierarchical categorization (optional)';

-- =========================
-- RULESETS TABLE
-- =========================

CREATE TABLE public.rulesets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key               VARCHAR(255) UNIQUE NOT NULL,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    authority_id      UUID,
    current_version   VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    status            ruleset_status NOT NULL DEFAULT 'active',
    metadata          JSONB DEFAULT '{}',
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_rulesets_authority
        FOREIGN KEY (authority_id)
        REFERENCES public.authorities(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_rulesets_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.rulesets IS 'Legal rulesets containing authority-specific clauses and rules';
COMMENT ON COLUMN public.rulesets.key IS 'Unique ruleset identifier (e.g., dmcc_employment_rules_v1)';
COMMENT ON COLUMN public.rulesets.current_version IS 'Current active version number';
COMMENT ON COLUMN public.rulesets.status IS 'Ruleset status: active, inactive, or deprecated';
COMMENT ON COLUMN public.rulesets.metadata IS 'Additional metadata about the ruleset';

-- =========================
-- RULESET VERSIONS TABLE
-- =========================

CREATE TABLE public.ruleset_versions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruleset_id    UUID NOT NULL,
    version       VARCHAR(50) NOT NULL,
    clauses       JSONB NOT NULL DEFAULT '[]',
    changelog     TEXT,
    metadata      JSONB DEFAULT '{}',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_ruleset_versions_ruleset
        FOREIGN KEY (ruleset_id)
        REFERENCES public.rulesets(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_ruleset_versions_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT uq_ruleset_versions_ruleset_version
        UNIQUE (ruleset_id, version)
);

COMMENT ON TABLE public.ruleset_versions IS 'Version history for rulesets - immutable audit trail';
COMMENT ON COLUMN public.ruleset_versions.clauses IS 'Array of legal clauses/rules in JSONB format';
COMMENT ON COLUMN public.ruleset_versions.is_active IS 'Whether this version is currently active';
COMMENT ON COLUMN public.ruleset_versions.changelog IS 'Description of changes in this version';

-- =========================
-- TEMPLATES TABLE
-- =========================

CREATE TABLE public.templates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key               VARCHAR(255) UNIQUE NOT NULL,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    category_id       UUID,
    authority_id      UUID,
    languages         TEXT[] NOT NULL DEFAULT ARRAY['en'],
    current_version   VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    status            template_status NOT NULL DEFAULT 'active',
    file_url          TEXT,
    thumbnail_url     TEXT,
    metadata          JSONB DEFAULT '{}',
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_templates_category
        FOREIGN KEY (category_id)
        REFERENCES public.categories(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_templates_authority
        FOREIGN KEY (authority_id)
        REFERENCES public.authorities(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_templates_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.templates IS 'Template metadata - main template registry';
COMMENT ON COLUMN public.templates.key IS 'Unique template identifier (e.g., dmcc_employment_v1)';
COMMENT ON COLUMN public.templates.current_version IS 'Current active version number';
COMMENT ON COLUMN public.templates.status IS 'Template status: active, inactive, draft, or deprecated';
COMMENT ON COLUMN public.templates.file_url IS 'S3 URL to current version DOCX file';
COMMENT ON COLUMN public.templates.languages IS 'Supported languages: en, ar, bilingual';

-- =========================
-- TEMPLATE VERSIONS TABLE
-- =========================

CREATE TABLE public.template_versions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   UUID NOT NULL,
    version       VARCHAR(50) NOT NULL,
    fields        JSONB NOT NULL DEFAULT '[]',
    file_url      TEXT NOT NULL,
    changelog     TEXT,
    metadata      JSONB DEFAULT '{}',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_template_versions_template
        FOREIGN KEY (template_id)
        REFERENCES public.templates(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_template_versions_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT uq_template_versions_template_version
        UNIQUE (template_id, version)
);

COMMENT ON TABLE public.template_versions IS 'Version history for templates - immutable audit trail';
COMMENT ON COLUMN public.template_versions.fields IS 'Field definitions for this version (JSONB array)';
COMMENT ON COLUMN public.template_versions.file_url IS 'S3 URL to this version DOCX file';
COMMENT ON COLUMN public.template_versions.is_active IS 'Whether this version is currently active';
COMMENT ON COLUMN public.template_versions.changelog IS 'Description of changes in this version';

-- =========================
-- TEMPLATE RULESETS (Many-to-Many)
-- =========================

CREATE TABLE public.template_rulesets (
    template_id   UUID NOT NULL,
    ruleset_id    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (template_id, ruleset_id),

    CONSTRAINT fk_template_rulesets_template
        FOREIGN KEY (template_id)
        REFERENCES public.templates(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_template_rulesets_ruleset
        FOREIGN KEY (ruleset_id)
        REFERENCES public.rulesets(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.template_rulesets IS 'Many-to-many relationship between templates and rulesets';

-- =========================
-- TEMPLATE VERSION RULESET VERSIONS (Many-to-Many for Versions)
-- =========================

CREATE TABLE public.template_version_ruleset_versions (
    template_version_id   UUID NOT NULL,
    ruleset_version_id    UUID NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (template_version_id, ruleset_version_id),

    CONSTRAINT fk_template_version_ruleset_versions_template_version
        FOREIGN KEY (template_version_id)
        REFERENCES public.template_versions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_template_version_ruleset_versions_ruleset_version
        FOREIGN KEY (ruleset_version_id)
        REFERENCES public.ruleset_versions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.template_version_ruleset_versions IS 'Many-to-many relationship tracking which ruleset versions were used in each template version';

-- =========================
-- INDEXES
-- =========================

-- Authorities
CREATE INDEX idx_authorities_code ON public.authorities(code);
CREATE INDEX idx_authorities_is_active ON public.authorities(is_active) WHERE is_active = true;
CREATE INDEX idx_authorities_country ON public.authorities(country);

-- Categories
CREATE INDEX idx_categories_code ON public.categories(code);
CREATE INDEX idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX idx_categories_is_active ON public.categories(is_active) WHERE is_active = true;

-- Rulesets
CREATE INDEX idx_rulesets_key ON public.rulesets(key);
CREATE INDEX idx_rulesets_authority_id ON public.rulesets(authority_id);
CREATE INDEX idx_rulesets_status ON public.rulesets(status);
CREATE INDEX idx_rulesets_created_by ON public.rulesets(created_by);

-- Ruleset Versions
CREATE INDEX idx_ruleset_versions_ruleset_id ON public.ruleset_versions(ruleset_id);
CREATE INDEX idx_ruleset_versions_version ON public.ruleset_versions(version);
CREATE INDEX idx_ruleset_versions_is_active ON public.ruleset_versions(is_active) WHERE is_active = true;
CREATE INDEX idx_ruleset_versions_created_by ON public.ruleset_versions(created_by);

-- Templates
CREATE INDEX idx_templates_key ON public.templates(key);
CREATE INDEX idx_templates_category_id ON public.templates(category_id);
CREATE INDEX idx_templates_authority_id ON public.templates(authority_id);
CREATE INDEX idx_templates_status ON public.templates(status);
CREATE INDEX idx_templates_created_by ON public.templates(created_by);
CREATE INDEX idx_templates_languages ON public.templates USING GIN(languages);

-- Template Versions
CREATE INDEX idx_template_versions_template_id ON public.template_versions(template_id);
CREATE INDEX idx_template_versions_version ON public.template_versions(version);
CREATE INDEX idx_template_versions_is_active ON public.template_versions(is_active) WHERE is_active = true;
CREATE INDEX idx_template_versions_created_by ON public.template_versions(created_by);

-- Template Rulesets
CREATE INDEX idx_template_rulesets_template_id ON public.template_rulesets(template_id);
CREATE INDEX idx_template_rulesets_ruleset_id ON public.template_rulesets(ruleset_id);

-- Template Version Ruleset Versions
CREATE INDEX idx_template_version_ruleset_versions_template_version_id ON public.template_version_ruleset_versions(template_version_id);
CREATE INDEX idx_template_version_ruleset_versions_ruleset_version_id ON public.template_version_ruleset_versions(ruleset_version_id);

-- =========================
-- TRIGGERS
-- =========================

-- Auto-update updated_at timestamps
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

-- =========================
-- VERSION SYNC FUNCTIONS
-- =========================

-- Function to update template's current_version when a new active version is created
CREATE OR REPLACE FUNCTION public.update_template_current_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- When a new version is created or updated to active, update the template's current_version
    IF NEW.is_active = true THEN
        UPDATE public.templates
        SET current_version = NEW.version,
            file_url = NEW.file_url,
            updated_at = now()
        WHERE id = NEW.template_id;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_template_current_version IS 'Trigger function to sync template.current_version with active template_version';

CREATE TRIGGER trigger_update_template_version
    AFTER INSERT OR UPDATE ON public.template_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_template_current_version();

-- Function to update ruleset's current_version when a new active version is created
CREATE OR REPLACE FUNCTION public.update_ruleset_current_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- When a new version is created or updated to active, update the ruleset's current_version
    IF NEW.is_active = true THEN
        UPDATE public.rulesets
        SET current_version = NEW.version,
            updated_at = now()
        WHERE id = NEW.ruleset_id;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_ruleset_current_version IS 'Trigger function to sync ruleset.current_version with active ruleset_version';

CREATE TRIGGER trigger_update_ruleset_version
    AFTER INSERT OR UPDATE ON public.ruleset_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_ruleset_current_version();

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_ruleset_version ON public.ruleset_versions;
DROP TRIGGER IF EXISTS trigger_update_template_version ON public.template_versions;
DROP TRIGGER IF EXISTS update_templates_updated_at ON public.templates;
DROP TRIGGER IF EXISTS update_rulesets_updated_at ON public.rulesets;
DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
DROP TRIGGER IF EXISTS update_authorities_updated_at ON public.authorities;

-- Drop functions
DROP FUNCTION IF EXISTS public.update_ruleset_current_version();
DROP FUNCTION IF EXISTS public.update_template_current_version();

-- Drop indexes
DROP INDEX IF EXISTS public.idx_template_version_ruleset_versions_ruleset_version_id;
DROP INDEX IF EXISTS public.idx_template_version_ruleset_versions_template_version_id;
DROP INDEX IF EXISTS public.idx_template_rulesets_ruleset_id;
DROP INDEX IF EXISTS public.idx_template_rulesets_template_id;
DROP INDEX IF EXISTS public.idx_template_versions_created_by;
DROP INDEX IF EXISTS public.idx_template_versions_is_active;
DROP INDEX IF EXISTS public.idx_template_versions_version;
DROP INDEX IF EXISTS public.idx_template_versions_template_id;
DROP INDEX IF EXISTS public.idx_templates_languages;
DROP INDEX IF EXISTS public.idx_templates_created_by;
DROP INDEX IF EXISTS public.idx_templates_status;
DROP INDEX IF EXISTS public.idx_templates_authority_id;
DROP INDEX IF EXISTS public.idx_templates_category_id;
DROP INDEX IF EXISTS public.idx_templates_key;
DROP INDEX IF EXISTS public.idx_ruleset_versions_created_by;
DROP INDEX IF EXISTS public.idx_ruleset_versions_is_active;
DROP INDEX IF EXISTS public.idx_ruleset_versions_version;
DROP INDEX IF EXISTS public.idx_ruleset_versions_ruleset_id;
DROP INDEX IF EXISTS public.idx_rulesets_created_by;
DROP INDEX IF EXISTS public.idx_rulesets_status;
DROP INDEX IF EXISTS public.idx_rulesets_authority_id;
DROP INDEX IF EXISTS public.idx_rulesets_key;
DROP INDEX IF EXISTS public.idx_categories_is_active;
DROP INDEX IF EXISTS public.idx_categories_parent_id;
DROP INDEX IF EXISTS public.idx_categories_code;
DROP INDEX IF EXISTS public.idx_authorities_country;
DROP INDEX IF EXISTS public.idx_authorities_is_active;
DROP INDEX IF EXISTS public.idx_authorities_code;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS public.template_version_ruleset_versions;
DROP TABLE IF EXISTS public.template_rulesets;
DROP TABLE IF EXISTS public.template_versions;
DROP TABLE IF EXISTS public.templates;
DROP TABLE IF EXISTS public.ruleset_versions;
DROP TABLE IF EXISTS public.rulesets;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.authorities;

-- Drop ENUMs
DROP TYPE IF EXISTS ruleset_status;
DROP TYPE IF EXISTS template_status;

COMMIT;
*/

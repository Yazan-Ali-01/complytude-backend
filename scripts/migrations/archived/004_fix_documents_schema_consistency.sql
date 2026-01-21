-- ============================================================================
-- Migration 004: Fix Documents Table Schema Consistency
-- ============================================================================
-- Description: Adds missing template-related columns to existing tenant schemas
-- Dependencies: 001_init_multi_tenancy.sql, 002_init_auth.sql, 003_init_templates.sql
-- ============================================================================
-- 
-- Background:
-- Early tenant schemas created via AuthService were missing three columns
-- that were later added to TenantService.initializeTenantSchema():
--   - template_key VARCHAR(255)
--   - template_version VARCHAR(50)
--   - generation_metadata JSONB
--   - idx_documents_template_key index
--
-- This migration:
--   1. Syncs tenant_schemas table from tenants table (for old tenants)
--   2. Adds missing columns to all tenant documents tables
--   3. Creates missing indexes
--   4. Ensures all tenant schemas have consistent structure
--
-- Safe to run multiple times (idempotent).
-- ============================================================================

DO $$
DECLARE
    v_schema_record RECORD;
    v_schema_name VARCHAR(255);
    v_table_exists BOOLEAN;
    v_has_template_key BOOLEAN;
    v_has_template_version BOOLEAN;
    v_has_generation_metadata BOOLEAN;
    v_has_index BOOLEAN;
    v_total_schemas INTEGER := 0;
    v_schemas_updated INTEGER := 0;
    v_schemas_skipped INTEGER := 0;
    v_columns_added INTEGER := 0;
    v_indexes_created INTEGER := 0;
    v_missing_columns TEXT;
    v_tenant_schemas_synced INTEGER := 0;
BEGIN
    RAISE NOTICE '============================================================================';
    RAISE NOTICE '🔍 Scanning tenant schemas for documents table inconsistencies...';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE '';

    -- First, sync tenant_schemas table from tenants table (for old tenants created without tenant_schemas records)
    RAISE NOTICE '📋 Step 1: Syncing tenant_schemas table...';
    FOR v_schema_record IN 
        SELECT t.tenant_id, t.schema_name, t.created_at
        FROM public.tenants t
        WHERE t.is_active = true
        AND t.schema_name IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM public.tenant_schemas ts 
            WHERE ts.tenant_id = t.tenant_id
        )
        ORDER BY t.created_at ASC
    LOOP
        INSERT INTO public.tenant_schemas (tenant_id, schema_name, is_active, created_at)
        VALUES (v_schema_record.tenant_id, v_schema_record.schema_name, true, v_schema_record.created_at)
        ON CONFLICT (tenant_id) DO NOTHING;
        
        v_tenant_schemas_synced := v_tenant_schemas_synced + 1;
        RAISE NOTICE '   ✅ Added tenant_schemas record for: %', v_schema_record.schema_name;
    END LOOP;
    
    IF v_tenant_schemas_synced > 0 THEN
        RAISE NOTICE '✅ Synced % tenant schema record(s)', v_tenant_schemas_synced;
    ELSE
        RAISE NOTICE 'ℹ️  All tenant schemas already tracked';
    END IF;
    RAISE NOTICE '';
    
    -- Now process all tenant schemas
    RAISE NOTICE '📋 Step 2: Fixing documents table schema...';
    
    -- Loop through all tenant schemas (now guaranteed to be in tenant_schemas)
    FOR v_schema_record IN 
        SELECT schema_name, tenant_id 
        FROM public.tenant_schemas 
        WHERE is_active = true
        ORDER BY created_at ASC
    LOOP
        v_schema_name := v_schema_record.schema_name;
        v_total_schemas := v_total_schemas + 1;
        v_missing_columns := '';

        -- Check if documents table exists in this schema
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = v_schema_name 
            AND table_name = 'documents'
        ) INTO v_table_exists;

        IF NOT v_table_exists THEN
            RAISE NOTICE '⚠️  Schema %: documents table does not exist (skipping)', v_schema_name;
            v_schemas_skipped := v_schemas_skipped + 1;
            CONTINUE;
        END IF;

        -- Check for existence of each column
        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = v_schema_name
            AND table_name = 'documents'
            AND column_name = 'template_key'
        ) INTO v_has_template_key;

        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = v_schema_name
            AND table_name = 'documents'
            AND column_name = 'template_version'
        ) INTO v_has_template_version;

        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = v_schema_name
            AND table_name = 'documents'
            AND column_name = 'generation_metadata'
        ) INTO v_has_generation_metadata;

        -- Check for index existence
        SELECT EXISTS (
            SELECT FROM pg_indexes
            WHERE schemaname = v_schema_name
            AND tablename = 'documents'
            AND indexname = 'idx_documents_template_key'
        ) INTO v_has_index;

        -- If all columns and index exist, skip this schema
        IF v_has_template_key AND v_has_template_version AND v_has_generation_metadata AND v_has_index THEN
            RAISE NOTICE 'ℹ️  Schema %: Already up to date', v_schema_name;
            CONTINUE;
        END IF;

        -- Build list of missing columns for logging
        IF NOT v_has_template_key THEN
            v_missing_columns := v_missing_columns || 'template_key, ';
        END IF;
        IF NOT v_has_template_version THEN
            v_missing_columns := v_missing_columns || 'template_version, ';
        END IF;
        IF NOT v_has_generation_metadata THEN
            v_missing_columns := v_missing_columns || 'generation_metadata, ';
        END IF;
        IF NOT v_has_index THEN
            v_missing_columns := v_missing_columns || 'idx_documents_template_key';
        END IF;
        -- Trim trailing comma and space
        v_missing_columns := RTRIM(v_missing_columns, ', ');

        RAISE NOTICE '🔧 Schema %: Fixing missing: %', v_schema_name, v_missing_columns;

        -- Add missing columns
        IF NOT v_has_template_key THEN
            EXECUTE format('ALTER TABLE %I.documents ADD COLUMN template_key VARCHAR(255)', v_schema_name);
            v_columns_added := v_columns_added + 1;
            RAISE NOTICE '   ✅ Added column: template_key';
        END IF;

        IF NOT v_has_template_version THEN
            EXECUTE format('ALTER TABLE %I.documents ADD COLUMN template_version VARCHAR(50)', v_schema_name);
            v_columns_added := v_columns_added + 1;
            RAISE NOTICE '   ✅ Added column: template_version';
        END IF;

        IF NOT v_has_generation_metadata THEN
            EXECUTE format('ALTER TABLE %I.documents ADD COLUMN generation_metadata JSONB', v_schema_name);
            v_columns_added := v_columns_added + 1;
            RAISE NOTICE '   ✅ Added column: generation_metadata';
        END IF;

        -- Create missing index
        IF NOT v_has_index THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_documents_template_key ON %I.documents(template_key)', v_schema_name);
            v_indexes_created := v_indexes_created + 1;
            RAISE NOTICE '   ✅ Created index: idx_documents_template_key';
        END IF;

        v_schemas_updated := v_schemas_updated + 1;
        RAISE NOTICE '';

    END LOOP;

    -- Summary report
    RAISE NOTICE '============================================================================';
    RAISE NOTICE '📊 MIGRATION SUMMARY';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Tenant schemas synced to tracking table: %', v_tenant_schemas_synced;
    RAISE NOTICE 'Total tenant schemas processed: %', v_total_schemas;
    RAISE NOTICE 'Schemas updated: %', v_schemas_updated;
    RAISE NOTICE 'Schemas already consistent: %', v_total_schemas - v_schemas_updated - v_schemas_skipped;
    RAISE NOTICE 'Schemas skipped (no documents table): %', v_schemas_skipped;
    RAISE NOTICE 'Total columns added: %', v_columns_added;
    RAISE NOTICE 'Total indexes created: %', v_indexes_created;
    RAISE NOTICE '============================================================================';
    
    IF v_tenant_schemas_synced > 0 THEN
        RAISE NOTICE '✅ Synced % tenant schema tracking record(s)', v_tenant_schemas_synced;
    END IF;
    
    IF v_schemas_updated > 0 THEN
        RAISE NOTICE '✅ Successfully updated % tenant schema(s)', v_schemas_updated;
    END IF;
    
    IF v_total_schemas - v_schemas_updated - v_schemas_skipped > 0 THEN
        RAISE NOTICE '✅ % schema(s) were already consistent', v_total_schemas - v_schemas_updated - v_schemas_skipped;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 004 completed successfully';
    RAISE NOTICE '✅ All tenant schemas now have consistent documents table structure';
    RAISE NOTICE '============================================================================';

END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Query 1: Check if tenant_schemas is synced with tenants table
-- Should return 0 rows if everything is synced
--
-- SELECT 
--     t.tenant_id,
--     t.schema_name,
--     t.email,
--     'Missing from tenant_schemas' as issue
-- FROM public.tenants t
-- WHERE t.is_active = true
-- AND t.schema_name IS NOT NULL
-- AND NOT EXISTS (
--     SELECT 1 FROM public.tenant_schemas ts 
--     WHERE ts.tenant_id = t.tenant_id
-- );
--
-- Expected: 0 rows (all tenants should have tenant_schemas records)
-- ============================================================================

-- Query 2: Verify all schemas have the required columns and index
--
-- SELECT 
--     ts.schema_name,
--     ts.tenant_id,
--     EXISTS(SELECT 1 FROM information_schema.tables 
--            WHERE table_schema = ts.schema_name 
--            AND table_name = 'documents') as has_documents_table,
--     EXISTS(SELECT 1 FROM information_schema.columns 
--            WHERE table_schema = ts.schema_name 
--            AND table_name = 'documents' 
--            AND column_name = 'template_key') as has_template_key,
--     EXISTS(SELECT 1 FROM information_schema.columns 
--            WHERE table_schema = ts.schema_name 
--            AND table_name = 'documents' 
--            AND column_name = 'template_version') as has_template_version,
--     EXISTS(SELECT 1 FROM information_schema.columns 
--            WHERE table_schema = ts.schema_name 
--            AND table_name = 'documents' 
--            AND column_name = 'generation_metadata') as has_generation_metadata,
--     EXISTS(SELECT 1 FROM pg_indexes 
--            WHERE schemaname = ts.schema_name 
--            AND tablename = 'documents' 
--            AND indexname = 'idx_documents_template_key') as has_index
-- FROM public.tenant_schemas ts
-- WHERE is_active = true
-- ORDER BY ts.created_at;
--
-- Expected: All boolean columns should be 't' (true)
-- ============================================================================

-- Query 3: Quick consistency check - shows only inconsistent schemas
--
-- SELECT 
--     ts.schema_name,
--     ts.tenant_id,
--     CASE 
--         WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns 
--                        WHERE table_schema = ts.schema_name 
--                        AND table_name = 'documents' 
--                        AND column_name = 'template_key') 
--         THEN 'Missing template_key'
--         WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns 
--                        WHERE table_schema = ts.schema_name 
--                        AND table_name = 'documents' 
--                        AND column_name = 'template_version') 
--         THEN 'Missing template_version'
--         WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns 
--                        WHERE table_schema = ts.schema_name 
--                        AND table_name = 'documents' 
--                        AND column_name = 'generation_metadata') 
--         THEN 'Missing generation_metadata'
--         WHEN NOT EXISTS(SELECT 1 FROM pg_indexes 
--                        WHERE schemaname = ts.schema_name 
--                        AND tablename = 'documents' 
--                        AND indexname = 'idx_documents_template_key') 
--         THEN 'Missing index'
--         ELSE 'Consistent'
--     END as status
-- FROM public.tenant_schemas ts
-- WHERE is_active = true
-- AND EXISTS(SELECT 1 FROM information_schema.tables 
--           WHERE table_schema = ts.schema_name 
--           AND table_name = 'documents')
-- ORDER BY ts.created_at;
--
-- Expected: All rows should show 'Consistent'
-- ============================================================================


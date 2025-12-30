-- ============================================================================
-- Migration 004: Add Soft Delete to Documents Table
-- ============================================================================
-- Description: Adds soft delete columns to tenant documents tables
-- Dependencies: 001_init_multi_tenancy.sql
-- ============================================================================

-- This migration adds soft delete functionality to all existing tenant schemas
-- New tenant schemas will need these columns added during initialization

-- Function to add soft delete columns to a specific tenant schema
CREATE OR REPLACE FUNCTION add_soft_delete_to_tenant_documents(schema_name TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format('
    ALTER TABLE %I.documents 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) NULL;
  ', schema_name);
  
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON %I.documents(deleted_at);
  ', schema_name);
  
  RAISE NOTICE 'Added soft delete columns to %.documents', schema_name;
END;
$$ LANGUAGE plpgsql;

-- Apply to all existing tenant schemas
DO $$
DECLARE
  tenant_schema RECORD;
BEGIN
  FOR tenant_schema IN 
    SELECT schema_name FROM public.tenant_schemas WHERE is_active = true
  LOOP
    PERFORM add_soft_delete_to_tenant_documents(tenant_schema.schema_name);
  END LOOP;
END $$;

-- Add comments
COMMENT ON FUNCTION add_soft_delete_to_tenant_documents(TEXT) IS 'Adds soft delete columns (deleted_at, deleted_by) to documents table in specified tenant schema';


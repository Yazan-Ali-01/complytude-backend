-- =========================
-- Seed Script 002: Categories
-- =========================
-- Description: Seed initial template categories with hierarchical structure
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- =========================

BEGIN;

-- Insert top-level categories first
INSERT INTO public.categories (code, name, description, parent_id, is_active) VALUES
    ('employment', 'Employment Contracts', 'Employment and labor agreements for full-time, part-time, and contract workers', NULL, true),
    ('freelance', 'Freelance Agreements', 'Independent contractor and freelance service agreements', NULL, true),
    ('commercial', 'Commercial Contracts', 'Business-to-business commercial agreements and transactions', NULL, true),
    ('lease', 'Lease Agreements', 'Property and equipment lease contracts', NULL, true),
    ('service', 'Service Agreements', 'Service provider and professional services contracts', NULL, true),
    ('nda', 'Non-Disclosure Agreements', 'Confidentiality and non-disclosure agreements', NULL, true),
    ('partnership', 'Partnership Agreements', 'Business partnership and joint venture contracts', NULL, true),
    ('corporate', 'Corporate Documents', 'Corporate governance and shareholder documents', NULL, true),
    ('compliance', 'Compliance Documents', 'Regulatory compliance and legal requirement documents', NULL, true),
    ('intellectual_property', 'Intellectual Property', 'IP licensing, assignment, and protection agreements', NULL, true)
ON CONFLICT (code) DO NOTHING;

-- Insert sub-categories (if needed in the future, uncomment and modify)
-- Example: Employment sub-categories
/*
INSERT INTO public.categories (code, name, description, parent_id, is_active)
SELECT 
    'employment_limited', 
    'Limited Contract', 
    'Fixed-term employment contracts', 
    id, 
    true
FROM public.categories WHERE code = 'employment'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.categories (code, name, description, parent_id, is_active)
SELECT 
    'employment_unlimited', 
    'Unlimited Contract', 
    'Indefinite-term employment contracts', 
    id, 
    true
FROM public.categories WHERE code = 'employment'
ON CONFLICT (code) DO NOTHING;
*/

COMMIT;

-- =========================
-- Verification Query
-- =========================
-- Run this to verify the seed data:
-- SELECT code, name, parent_id, is_active FROM public.categories ORDER BY code;

-- =========================
-- Seed Script 001: Authorities
-- =========================
-- Description: Seed initial legal authorities for UAE
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- =========================

BEGIN;

INSERT INTO public.authorities (code, name, description, country, is_active) VALUES
    ('DMCC', 'Dubai Multi Commodities Centre', 'Dubai free zone authority specializing in commodities trading and related services', 'UAE', true),
    ('IFZA', 'International Free Zone Authority', 'Fujairah free zone authority offering business setup and licensing services', 'UAE', true),
    ('DED', 'Department of Economic Development', 'Dubai mainland business authority responsible for commercial licensing and regulation', 'UAE', true),
    ('RAKEZ', 'Ras Al Khaimah Economic Zone', 'RAK free zone authority providing business solutions and industrial facilities', 'UAE', true),
    ('ADGM', 'Abu Dhabi Global Market', 'Abu Dhabi financial free zone with independent regulatory framework', 'UAE', true),
    ('DIFC', 'Dubai International Financial Centre', 'Dubai financial free zone with common law jurisdiction', 'UAE', true),
    ('SHAMS', 'Sharjah Media City (Shams)', 'Sharjah free zone for media and creative industries', 'UAE', true),
    ('DAFZA', 'Dubai Airport Free Zone Authority', 'Free zone authority located at Dubai International Airport', 'UAE', true),
    ('JAFZA', 'Jebel Ali Free Zone', 'One of the largest free zones in Dubai, located at Jebel Ali Port', 'UAE', true),
    ('ADCCI', 'Abu Dhabi Chamber of Commerce and Industry', 'Abu Dhabi mainland business authority and chamber of commerce', 'UAE', true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- =========================
-- Verification Query
-- =========================
-- Run this to verify the seed data:
-- SELECT code, name, country, is_active FROM public.authorities ORDER BY code;

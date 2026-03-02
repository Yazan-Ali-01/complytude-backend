BEGIN;

-- =========================
-- Migration 001: Core Tables
-- =========================
-- Description: Core schema with tenants, users, user-tenant relationships, and auth artifacts
-- Uses UUID for IDs, ENUMs for constrained types, optimized indexes
-- =========================

-- =========================
-- ENUMS
-- =========================

CREATE TYPE tenant_plan AS ENUM ('navigator', 'shield', 'general_counsel', 'infrastructure');
CREATE TYPE invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED');
CREATE TYPE refresh_token_type AS ENUM ('identity', 'tenant');

-- =========================
-- Tenants
-- =========================
CREATE TABLE public.tenants (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(255) DEFAULT NULL,
    plan             tenant_plan NOT NULL DEFAULT 'navigator',
    logo_url         TEXT DEFAULT NULL,
    brand_color_primary VARCHAR(7) DEFAULT NULL,
    brand_color_secondary VARCHAR(7) DEFAULT NULL,
    contact_email    VARCHAR(255) DEFAULT NULL,
    billing_email    VARCHAR(255) DEFAULT NULL,
    contact_phone    VARCHAR(50) DEFAULT NULL,
    emirate          VARCHAR(50) DEFAULT NULL,
    city             VARCHAR(100) DEFAULT NULL,
    address_line_1   VARCHAR(500) DEFAULT NULL,
    address_line_2   VARCHAR(500) DEFAULT NULL,
    postal_code      VARCHAR(20) DEFAULT NULL,
    trade_license_number VARCHAR(100) DEFAULT NULL,
    legal_entity_type VARCHAR(50) DEFAULT NULL,
    tax_registration_number VARCHAR(100) DEFAULT NULL,
    locale             VARCHAR(50) DEFAULT 'en',
    timezone           VARCHAR(50) DEFAULT NULL,
    default_jurisdiction VARCHAR(100) DEFAULT NULL,
    settings           JSONB DEFAULT '{}',
    slug             VARCHAR(255) UNIQUE DEFAULT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    parent_tenant_id UUID,
    onboarding_completed_at TIMESTAMPTZ DEFAULT NULL,
    onboarding_metadata JSONB DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deactivated_at   TIMESTAMPTZ DEFAULT NULL,
    deactivation_reason TEXT DEFAULT NULL,
    stripe_customer_id VARCHAR(255) UNIQUE DEFAULT NULL,

    CONSTRAINT fk_tenants_parent
        FOREIGN KEY (parent_tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.tenants IS 'Organizations/companies using the platform';
COMMENT ON COLUMN public.tenants.id IS 'Unique tenant identifier (UUID)';
COMMENT ON COLUMN public.tenants.name IS 'Tenant name (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.stripe_customer_id IS 'Stripe customer ID (cus_xxx), NULL until billing is set up';
COMMENT ON COLUMN public.tenants.plan IS 'Subscription plan: navigator, shield, general_counsel, or infrastructure';
COMMENT ON COLUMN public.tenants.logo_url IS 'Tenant logo URL (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.brand_color_primary IS 'Tenant brand color primary (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.brand_color_secondary IS 'Tenant brand color secondary (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.contact_email IS 'Tenant contact email (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.billing_email IS 'Tenant billing email (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.contact_phone IS 'Tenant contact phone (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.emirate IS 'Tenant emirate (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.city IS 'Tenant city (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.address_line_1 IS 'Tenant address line 1 (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.address_line_2 IS 'Tenant address line 2 (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.postal_code IS 'Tenant postal code (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.trade_license_number IS 'Tenant trade license number (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.legal_entity_type IS 'Tenant legal entity type (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.tax_registration_number IS 'Tenant tax registration number (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.locale IS 'Tenant locale (en for English)';
COMMENT ON COLUMN public.tenants.timezone IS 'Tenant timezone (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.default_jurisdiction IS 'Tenant default jurisdiction (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.settings IS 'Tenant settings (JSONB)';
COMMENT ON COLUMN public.tenants.slug IS 'Tenant slug (NULL for anonymous tenants)';
COMMENT ON COLUMN public.tenants.is_active IS 'Whether the tenant account is active (soft delete flag)';
COMMENT ON COLUMN public.tenants.deactivated_at IS 'Tenant deactivation timestamp (NULL for active tenants)';
COMMENT ON COLUMN public.tenants.onboarding_completed_at IS 'Tenant onboarding completion timestamp (NULL for incomplete onboarding)';
COMMENT ON COLUMN public.tenants.onboarding_metadata IS 'Tenant onboarding metadata (JSONB)';
COMMENT ON COLUMN public.tenants.parent_tenant_id IS 'Parent tenant for Agency/Partner hierarchy (MVP+) - NULL for independent tenants';
COMMENT ON COLUMN public.tenants.deactivation_reason IS 'Tenant deactivation reason (NULL for active tenants)';

-- =========================
-- Users
-- =========================
CREATE TABLE public.users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            VARCHAR(255) UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    first_name       VARCHAR(255),
    last_name        VARCHAR(255),
    is_verified       BOOLEAN NOT NULL DEFAULT false,
    platform_role_key VARCHAR(50) NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT check_platform_role_key_format
        CHECK (platform_role_key IS NULL OR platform_role_key ~ '^[a-z_]+$')
);

COMMENT ON TABLE public.users IS 'User accounts that can access multiple tenants';
COMMENT ON COLUMN public.users.id IS 'Unique user identifier (UUID)';
COMMENT ON COLUMN public.users.email IS 'User email address (unique across platform)';
COMMENT ON COLUMN public.users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN public.users.is_verified IS 'Whether user has verified their email address';
COMMENT ON COLUMN public.users.platform_role_key IS 'Platform-level role key (e.g., system_admin, support, auditor). NULL for regular tenant-only users.';

-- =========================
-- Tenant RBAC: Roles
-- =========================
CREATE TABLE public.tenant_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(50) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    tenant_id   UUID,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_tenant_roles_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- Prevent custom roles from using reserved system role keys
    CONSTRAINT chk_tenant_roles_no_reserved_keys
        CHECK (
            -- If it's a custom role (tenant_id is NOT NULL)
            -- Then the key must NOT be one of the reserved system role keys
            (tenant_id IS NOT NULL AND key NOT IN ('tenant_admin', 'legal_counsel', 'member', 'viewer'))
            OR
            -- If it's a system role (tenant_id IS NULL), any key is allowed
            (tenant_id IS NULL)
        ),

    -- Ensure system roles MUST have tenant_id = NULL (prevents data corruption)
    CONSTRAINT chk_tenant_system_role_no_tenant
        CHECK (NOT is_system OR tenant_id IS NULL)
);

COMMENT ON TABLE public.tenant_roles IS 'Tenant roles with support for custom roles (MVP+)';
COMMENT ON COLUMN public.tenant_roles.key IS 'Role key used in code/JWT (e.g., tenant_admin) - slugified identifier';
COMMENT ON COLUMN public.tenant_roles.name IS 'Display name for UI (e.g., Tenant Admin)';
COMMENT ON COLUMN public.tenant_roles.tenant_id IS 'NULL for system (base) roles, UUID for custom tenant roles (MVP+)';
COMMENT ON COLUMN public.tenant_roles.is_system IS 'TRUE for base roles (tenant_admin, legal_counsel, member, viewer)';
COMMENT ON COLUMN public.tenant_roles.is_active IS 'Whether this role is active (soft delete)';
COMMENT ON CONSTRAINT chk_tenant_roles_no_reserved_keys ON public.tenant_roles IS 'Prevents custom tenant roles from using reserved system role keys';
COMMENT ON CONSTRAINT chk_tenant_system_role_no_tenant ON public.tenant_roles IS 'Enforces that system roles cannot have a tenant_id (prevents data corruption)';

-- =========================
-- Tenant RBAC: Permissions
-- =========================
CREATE TABLE public.tenant_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    resource    VARCHAR(50) NOT NULL,
    action      VARCHAR(50) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_permissions IS 'Tenant-level permissions for RBAC';
COMMENT ON COLUMN public.tenant_permissions.key IS 'Permission key used in code/decorators (e.g., documents:create)';
COMMENT ON COLUMN public.tenant_permissions.name IS 'Display name for UI (e.g., Create Documents)';
COMMENT ON COLUMN public.tenant_permissions.resource IS 'Resource type (e.g., documents, contracts, templates)';
COMMENT ON COLUMN public.tenant_permissions.action IS 'Action type (e.g., create, read, delete, manage)';

-- =========================
-- Tenant RBAC: Role Permissions (Many-to-Many)
-- =========================
CREATE TABLE public.tenant_role_permissions (
    role_id       UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (role_id, permission_id),

    CONSTRAINT fk_tenant_role_permissions_role
        FOREIGN KEY (role_id)
        REFERENCES public.tenant_roles(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_tenant_role_permissions_permission
        FOREIGN KEY (permission_id)
        REFERENCES public.tenant_permissions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.tenant_role_permissions IS 'Many-to-many relationship between tenant roles and tenant permissions';

-- =========================
-- Platform RBAC: Roles
-- =========================
CREATE TABLE public.platform_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(50) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_platform_roles_no_reserved_keys
        CHECK (
            (is_system = false AND key NOT IN ('system_admin', 'support', 'auditor'))
            OR
            (is_system = true)
        )
);

COMMENT ON TABLE public.platform_roles IS 'Platform-level roles for system-wide access control';
COMMENT ON COLUMN public.platform_roles.key IS 'Role key (e.g., system_admin, support, auditor)';
COMMENT ON COLUMN public.platform_roles.is_system IS 'TRUE for built-in roles, FALSE for custom platform roles (future)';

-- =========================
-- Platform RBAC: Permissions
-- =========================
CREATE TABLE public.platform_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    resource    VARCHAR(50) NOT NULL,
    action      VARCHAR(50) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_permissions IS 'Platform-level permissions for system-wide RBAC';
COMMENT ON COLUMN public.platform_permissions.key IS 'Permission key (e.g., tenants:read, users:manage_roles)';

-- =========================
-- Platform RBAC: Role Permissions (Many-to-Many)
-- =========================
CREATE TABLE public.platform_role_permissions (
    role_id       UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (role_id, permission_id),

    CONSTRAINT fk_platform_role_permissions_role
        FOREIGN KEY (role_id)
        REFERENCES public.platform_roles(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_platform_role_permissions_permission
        FOREIGN KEY (permission_id)
        REFERENCES public.platform_permissions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.platform_role_permissions IS 'Many-to-many: platform roles to platform permissions';

-- =========================
-- Audit Logs
-- =========================
CREATE TABLE public.audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID,
    user_id       UUID,
    user_role     VARCHAR(50),
    action        VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id   UUID,
    details       JSONB DEFAULT '{}',
    ai_model_used VARCHAR(100),
    ip_address    VARCHAR(45),
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_audit_logs_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_audit_logs_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.audit_logs IS 'Audit trail for all user actions';
COMMENT ON COLUMN public.audit_logs.tenant_id IS 'Tenant ID (NULL for system-level actions)';
COMMENT ON COLUMN public.audit_logs.user_id IS 'User who performed the action';
COMMENT ON COLUMN public.audit_logs.user_role IS 'Role key at time of action (for historical record)';
COMMENT ON COLUMN public.audit_logs.action IS 'Action performed (e.g., documents:create, settings:change_jurisdiction)';
COMMENT ON COLUMN public.audit_logs.resource_type IS 'Type of resource affected (e.g., documents, templates)';
COMMENT ON COLUMN public.audit_logs.resource_id IS 'ID of the affected resource (if applicable)';
COMMENT ON COLUMN public.audit_logs.details IS 'Additional context (JSONB)';
COMMENT ON COLUMN public.audit_logs.ai_model_used IS 'AI model used for AI operations (prepared for future)';
COMMENT ON COLUMN public.audit_logs.ip_address IS 'IP address of the request';
COMMENT ON COLUMN public.audit_logs.user_agent IS 'User agent of the request';

-- =========================
-- User ↔ Tenant Membership
-- =========================
CREATE TABLE public.user_tenants (
    user_id     UUID NOT NULL,
    tenant_id   UUID NOT NULL,
    role_key    VARCHAR(50) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, tenant_id),

    CONSTRAINT fk_user_tenants_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_user_tenants_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT check_role_key_format
        CHECK (role_key ~ '^[a-z_]+$')
);

COMMENT ON TABLE public.user_tenants IS 'Many-to-many relationship: users can belong to multiple tenants with different roles';
COMMENT ON COLUMN public.user_tenants.role_key IS 'User role key within this tenant (e.g., tenant_admin, member, or custom role key)';
COMMENT ON COLUMN public.user_tenants.is_active IS 'Whether this membership is active (soft delete for user removal)';
COMMENT ON CONSTRAINT check_role_key_format ON public.user_tenants IS 'Ensures role_key uses lowercase letters and underscores only';

-- =========================
-- Auth Artifacts
-- =========================
CREATE TABLE public.refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    token_hash   VARCHAR(255) NOT NULL,
    token_type   refresh_token_type NOT NULL DEFAULT 'tenant',
    tenant_id    UUID,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at   TIMESTAMPTZ,

    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_refresh_tokens_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.refresh_tokens IS 'Refresh tokens for session management (JWT refresh flow)';
COMMENT ON COLUMN public.refresh_tokens.token_hash IS 'Hashed refresh token value';
COMMENT ON COLUMN public.refresh_tokens.token_type IS 'Token type: identity, tenant';
COMMENT ON COLUMN public.refresh_tokens.tenant_id IS 'Tenant ID for tenant-scoped refresh tokens (NULL for identity tokens)';
COMMENT ON COLUMN public.refresh_tokens.revoked_at IS 'Timestamp when token was revoked (NULL if still valid)';

CREATE TABLE public.email_verifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    token        VARCHAR(255) UNIQUE NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at  TIMESTAMPTZ,

    CONSTRAINT fk_email_verifications_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.email_verifications IS 'Email verification tokens sent during signup';
COMMENT ON COLUMN public.email_verifications.token IS 'Unique verification token sent via email';
COMMENT ON COLUMN public.email_verifications.verified_at IS 'Timestamp when email was verified (NULL if not yet verified)';

CREATE TABLE public.password_resets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    token        VARCHAR(255) UNIQUE NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at      TIMESTAMPTZ,

    CONSTRAINT fk_password_resets_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.password_resets IS 'Password reset tokens for forgot-password flow';
COMMENT ON COLUMN public.password_resets.token IS 'Unique reset token sent via email';
COMMENT ON COLUMN public.password_resets.used_at IS 'Timestamp when token was used to reset password (NULL if not yet used)';

CREATE TABLE public.invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL,
    tenant_id   UUID NOT NULL,
    token_hash  VARCHAR(255) UNIQUE NOT NULL,
    invited_by  UUID NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    revoked_by  UUID,
    role_id     UUID NOT NULL,
    status      invitation_status NOT NULL DEFAULT 'PENDING',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_invitations_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_invitations_invited_by
        FOREIGN KEY (invited_by)
        REFERENCES public.users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_invitations_revoked_by
        FOREIGN KEY (revoked_by)
        REFERENCES public.users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_invitations_tenant_role
        FOREIGN KEY (role_id)
        REFERENCES public.tenant_roles(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.invitations IS 'Invitations to join a tenant';
COMMENT ON COLUMN public.invitations.email IS 'Email address of the invited user';
COMMENT ON COLUMN public.invitations.tenant_id IS 'Tenant ID the user is invited to';
COMMENT ON COLUMN public.invitations.role_id IS 'Role to be assigned when invitation is accepted (references tenant_roles table)';
COMMENT ON COLUMN public.invitations.token_hash IS 'Unique invitation token sent via email';
COMMENT ON COLUMN public.invitations.invited_by IS 'User ID of the user who invited the user';
COMMENT ON COLUMN public.invitations.expires_at IS 'Timestamp when invitation expires';
COMMENT ON COLUMN public.invitations.accepted_at IS 'Timestamp when invitation was accepted';
COMMENT ON COLUMN public.invitations.rejected_at IS 'Timestamp when invitation was rejected by the invitee';
COMMENT ON COLUMN public.invitations.revoked_at IS 'Timestamp when invitation was revoked by the inviter/admin';
COMMENT ON COLUMN public.invitations.status IS 'Status of the invitation: pending, accepted, revoked, or expired';
COMMENT ON COLUMN public.invitations.revoked_by IS 'User ID of the user who revoked the invitation';

-- =========================
-- Indexes
-- =========================

-- Tenants
CREATE INDEX idx_tenants_is_active ON public.tenants(is_active) WHERE is_active = true;
CREATE INDEX idx_tenants_parent_tenant_id ON public.tenants(parent_tenant_id) WHERE parent_tenant_id IS NOT NULL;

-- Users
-- Note: email has UNIQUE constraint which creates an index automatically
-- Composite index for login queries (WHERE email = ? AND is_verified = ?)
CREATE INDEX idx_users_email_verified ON public.users(email, is_verified) WHERE is_verified = true;
CREATE INDEX idx_users_platform_role ON public.users(platform_role_key) WHERE platform_role_key IS NOT NULL;

-- Tenant Roles
CREATE INDEX idx_tenant_roles_key ON public.tenant_roles(key);
CREATE INDEX idx_tenant_roles_tenant_id ON public.tenant_roles(tenant_id);
CREATE INDEX idx_tenant_roles_is_system ON public.tenant_roles(is_system) WHERE is_system = true;
CREATE INDEX idx_tenant_roles_is_active ON public.tenant_roles(is_active) WHERE is_active = true;

-- Tenant Permissions
-- Note: key has UNIQUE constraint which creates an index automatically
CREATE INDEX idx_tenant_permissions_resource ON public.tenant_permissions(resource);

-- Tenant Role Permissions
CREATE INDEX idx_tenant_role_permissions_role_id ON public.tenant_role_permissions(role_id);
CREATE INDEX idx_tenant_role_permissions_permission_id ON public.tenant_role_permissions(permission_id);

-- Platform Roles
CREATE INDEX idx_platform_roles_key ON public.platform_roles(key);
CREATE INDEX idx_platform_roles_is_system ON public.platform_roles(is_system) WHERE is_system = true;
CREATE INDEX idx_platform_roles_is_active ON public.platform_roles(is_active) WHERE is_active = true;

-- Platform Permissions
CREATE INDEX idx_platform_permissions_resource ON public.platform_permissions(resource);

-- Platform Role Permissions
CREATE INDEX idx_platform_role_permissions_role_id ON public.platform_role_permissions(role_id);
CREATE INDEX idx_platform_role_permissions_permission_id ON public.platform_role_permissions(permission_id);

-- Audit Logs
CREATE INDEX idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);

-- User Tenants
-- Composite index for user's active tenants (WHERE user_id = ? AND is_active = true)
CREATE INDEX idx_user_tenants_user_active ON public.user_tenants(user_id, is_active)
WHERE is_active = true;

-- Composite index for tenant switch verification (WHERE user_id = ? AND tenant_id = ? AND is_active = true)
CREATE INDEX idx_user_tenants_user_tenant_active ON public.user_tenants(user_id, tenant_id, is_active)
WHERE is_active = true;

-- Index for tenant-based queries (WHERE tenant_id = ?)
CREATE INDEX idx_user_tenants_tenant_id ON public.user_tenants(tenant_id);

-- Refresh Tokens
-- Composite partial index for identity token refresh
-- Covers: WHERE user_id = ? AND token_hash = ? AND token_type = 'identity' AND revoked_at IS NULL
CREATE INDEX idx_refresh_tokens_user_token_identity ON public.refresh_tokens(user_id, token_hash, token_type)
WHERE token_type = 'identity' AND revoked_at IS NULL;

-- Composite partial index for tenant token refresh
-- Covers: WHERE user_id = ? AND tenant_id = ? AND token_hash = ? AND token_type = 'tenant' AND revoked_at IS NULL
CREATE INDEX idx_refresh_tokens_user_tenant_token ON public.refresh_tokens(user_id, tenant_id, token_hash, token_type)
WHERE token_type = 'tenant' AND revoked_at IS NULL;

-- Index for revoking all user tokens (WHERE user_id = ? AND revoked_at IS NULL)
CREATE INDEX idx_refresh_tokens_user_active ON public.refresh_tokens(user_id)
WHERE revoked_at IS NULL;

-- Index for cleanup queries (WHERE expires_at < NOW())
CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens(expires_at)
WHERE revoked_at IS NULL;

-- Email Verifications
-- Composite partial index for verification lookup
-- Covers: WHERE token = ? AND expires_at > NOW() AND verified_at IS NULL
CREATE INDEX idx_email_verifications_token_active ON public.email_verifications(token, expires_at)
WHERE verified_at IS NULL;

-- Password Resets
-- Composite partial index for reset token lookup
-- Covers: WHERE token = ? AND expires_at > NOW() AND used_at IS NULL
CREATE INDEX idx_password_resets_token_active ON public.password_resets(token, expires_at)
WHERE used_at IS NULL;

-- Invitations
-- Composite partial index for token resolution
-- Covers: WHERE token_hash = ? AND status = 'PENDING' AND expires_at > NOW()
CREATE INDEX idx_invitations_token_pending ON public.invitations(token_hash, expires_at)
WHERE status = 'PENDING';

-- Composite partial index for duplicate invitation check
-- Covers: WHERE email = ? AND tenant_id = ? AND status = 'PENDING'
CREATE INDEX idx_invitations_email_tenant_status ON public.invitations(email, tenant_id)
WHERE status = 'PENDING';

-- Composite partial index for listing user's pending invitations
-- Covers: WHERE email = ? AND status = 'PENDING' AND expires_at > NOW()
CREATE INDEX idx_invitations_email_pending ON public.invitations(email, expires_at)
WHERE status = 'PENDING';

-- Index for tenant admin listing invitations (WHERE tenant_id = ?)
CREATE INDEX idx_invitations_tenant_id ON public.invitations(tenant_id);

-- Index for tracking who invited (WHERE invited_by = ?)
CREATE INDEX idx_invitations_invited_by ON public.invitations(invited_by);

-- Unique constraint to prevent duplicate pending invitations
CREATE UNIQUE INDEX idx_invitations_email_tenant_pending
    ON public.invitations(email, tenant_id)
    WHERE status = 'PENDING';

-- Unique constraint to prevent duplicate system roles
CREATE UNIQUE INDEX idx_tenant_roles_key_system ON public.tenant_roles (key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX idx_tenant_roles_key_tenant ON public.tenant_roles (key, tenant_id) WHERE tenant_id IS NOT NULL;

-- Lookup by slug for URL resolution (partial index for non-null slugs)
CREATE INDEX idx_tenants_slug ON public.tenants(slug) WHERE slug IS NOT NULL;

-- Filter tenants by emirate (admin analytics, grouping)
CREATE INDEX idx_tenants_emirate ON public.tenants(emirate);

-- Quick lookup of deactivated tenants
CREATE INDEX idx_tenants_deactivated ON public.tenants(deactivated_at) WHERE deactivated_at IS NOT NULL;

-- Stripe customer lookup (partial: only indexes non-NULL values)
CREATE UNIQUE INDEX idx_tenants_stripe_customer_id ON public.tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;


-- =========================
-- THIS IS THE CODE FOR THE GLOBAL SLUG CHECK
-- =========================
-- -- Add this to your RLS migration file
-- CREATE OR REPLACE FUNCTION public.is_platform_context()
-- RETURNS BOOLEAN
-- LANGUAGE SQL
-- STABLE
-- AS $$
--     SELECT current_setting('app.platform_context', true)::boolean;
-- $$;

-- -- Update tenant_select policy
-- DROP POLICY IF EXISTS tenant_select ON public.tenants;
-- CREATE POLICY tenant_select
-- ON public.tenants
-- FOR SELECT
-- USING (
--     id = current_tenant_id_or_null()
--     OR is_auth_flow()
--     OR is_platform_admin()
--     OR is_platform_context()  -- ← Allows global slug checks
-- );

-- =========================
-- Triggers
-- =========================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column IS 'Trigger function to automatically update updated_at timestamp on row updates';

-- =========================
-- System Role Protection Functions
-- =========================

-- Function to prevent modifying tenant system roles core attributes
CREATE OR REPLACE FUNCTION public.prevent_tenant_system_role_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Prevent UPDATE on system roles critical attributes (key, is_system, tenant_id)
    IF OLD.is_system = true AND (
        OLD.key != NEW.key OR
        OLD.is_system != NEW.is_system OR
        OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Cannot modify core attributes of tenant system role: %', OLD.key
            USING HINT = 'Tenant system roles (is_system=true) are immutable. Use TenantRbacSyncService to update.';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_tenant_system_role_modification IS 'Prevents modification of critical tenant system role attributes (key, is_system, tenant_id)';

-- Function to prevent deleting tenant system roles
CREATE OR REPLACE FUNCTION public.prevent_tenant_system_role_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Prevent DELETE on system roles
    IF OLD.is_system = true THEN
        RAISE EXCEPTION 'Cannot delete tenant system role: %', OLD.key
            USING HINT = 'Tenant system roles are protected from deletion.';
    END IF;

    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.prevent_tenant_system_role_deletion IS 'Prevents deletion of tenant system roles';

-- Platform system role protection (platform_roles has no tenant_id)
CREATE OR REPLACE FUNCTION public.prevent_platform_system_role_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.is_system = true AND (
        OLD.key != NEW.key OR
        OLD.is_system != NEW.is_system
    ) THEN
        RAISE EXCEPTION 'Cannot modify core attributes of platform system role: %', OLD.key
            USING HINT = 'Platform system roles (is_system=true) are immutable. Use PlatformRbacSyncService to update.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_platform_system_role_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.is_system = true THEN
        RAISE EXCEPTION 'Cannot delete platform system role: %', OLD.key
            USING HINT = 'Platform system roles are protected from deletion.';
    END IF;
    RETURN OLD;
END;
$$;

-- =========================
-- Triggers
-- =========================

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_roles_updated_at
    BEFORE UPDATE ON public.tenant_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Tenant system role protection triggers
CREATE TRIGGER trigger_prevent_tenant_system_role_modification
    BEFORE UPDATE ON public.tenant_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_tenant_system_role_modification();

CREATE TRIGGER trigger_prevent_tenant_system_role_deletion
    BEFORE DELETE ON public.tenant_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_tenant_system_role_deletion();

-- Platform role triggers
CREATE TRIGGER update_platform_roles_updated_at
    BEFORE UPDATE ON public.platform_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_prevent_platform_system_role_modification
    BEFORE UPDATE ON public.platform_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_platform_system_role_modification();

CREATE TRIGGER trigger_prevent_platform_system_role_deletion
    BEFORE DELETE ON public.platform_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_platform_system_role_deletion();

CREATE TRIGGER update_user_tenants_updated_at
    BEFORE UPDATE ON public.user_tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at
    BEFORE UPDATE ON public.invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS update_invitations_updated_at ON public.invitations;
DROP TRIGGER IF EXISTS update_user_tenants_updated_at ON public.user_tenants;
DROP TRIGGER IF EXISTS trigger_prevent_tenant_system_role_deletion ON public.tenant_roles;
DROP TRIGGER IF EXISTS trigger_prevent_tenant_system_role_modification ON public.tenant_roles;
DROP TRIGGER IF EXISTS update_tenant_roles_updated_at ON public.tenant_roles;
DROP TRIGGER IF EXISTS trigger_prevent_platform_system_role_deletion ON public.platform_roles;
DROP TRIGGER IF EXISTS trigger_prevent_platform_system_role_modification ON public.platform_roles;
DROP TRIGGER IF EXISTS update_platform_roles_updated_at ON public.platform_roles;
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;

-- Drop functions
DROP FUNCTION IF EXISTS public.prevent_tenant_system_role_deletion();
DROP FUNCTION IF EXISTS public.prevent_tenant_system_role_modification();
DROP FUNCTION IF EXISTS public.prevent_platform_system_role_deletion();
DROP FUNCTION IF EXISTS public.prevent_platform_system_role_modification();
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- Drop indexes
DROP INDEX IF EXISTS public.idx_tenant_roles_key_tenant;
DROP INDEX IF EXISTS public.idx_tenant_roles_key_system;

DROP INDEX IF EXISTS public.idx_password_resets_token_active;
DROP INDEX IF EXISTS public.idx_email_verifications_token_active;

DROP INDEX IF EXISTS public.idx_refresh_tokens_expires_at;
DROP INDEX IF EXISTS public.idx_refresh_tokens_user_active;
DROP INDEX IF EXISTS public.idx_refresh_tokens_user_tenant_token;
DROP INDEX IF EXISTS public.idx_refresh_tokens_user_token_identity;

DROP INDEX IF EXISTS public.idx_user_tenants_tenant_id;
DROP INDEX IF EXISTS public.idx_user_tenants_user_tenant_active;
DROP INDEX IF EXISTS public.idx_user_tenants_user_active;

DROP INDEX IF EXISTS public.idx_users_email_verified;
DROP INDEX IF EXISTS public.idx_users_platform_role;

DROP INDEX IF EXISTS public.idx_tenants_stripe_customer_id;
DROP INDEX IF EXISTS public.idx_tenants_parent_tenant_id;
DROP INDEX IF EXISTS public.idx_tenants_is_active;
DROP INDEX IF EXISTS public.idx_tenants_deactivated;
DROP INDEX IF EXISTS public.idx_tenants_emirate;
DROP INDEX IF EXISTS public.idx_tenants_slug;


DROP INDEX IF EXISTS public.idx_invitations_email_tenant_pending;
DROP INDEX IF EXISTS public.idx_invitations_invited_by;
DROP INDEX IF EXISTS public.idx_invitations_tenant_id;
DROP INDEX IF EXISTS public.idx_invitations_email_pending;
DROP INDEX IF EXISTS public.idx_invitations_email_tenant_status;
DROP INDEX IF EXISTS public.idx_invitations_token_pending;

DROP INDEX IF EXISTS public.idx_audit_logs_tenant_created;
DROP INDEX IF EXISTS public.idx_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_audit_logs_action;
DROP INDEX IF EXISTS public.idx_audit_logs_user_id;
DROP INDEX IF EXISTS public.idx_audit_logs_tenant_id;

DROP INDEX IF EXISTS public.idx_tenant_role_permissions_permission_id;
DROP INDEX IF EXISTS public.idx_tenant_role_permissions_role_id;

DROP INDEX IF EXISTS public.idx_tenant_permissions_resource;

DROP INDEX IF EXISTS public.idx_tenant_roles_is_active;
DROP INDEX IF EXISTS public.idx_tenant_roles_is_system;
DROP INDEX IF EXISTS public.idx_tenant_roles_tenant_id;
DROP INDEX IF EXISTS public.idx_tenant_roles_key;

DROP INDEX IF EXISTS public.idx_platform_role_permissions_permission_id;
DROP INDEX IF EXISTS public.idx_platform_role_permissions_role_id;
DROP INDEX IF EXISTS public.idx_platform_permissions_resource;
DROP INDEX IF EXISTS public.idx_platform_roles_is_active;
DROP INDEX IF EXISTS public.idx_platform_roles_is_system;
DROP INDEX IF EXISTS public.idx_platform_roles_key;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS public.invitations;
DROP TABLE IF EXISTS public.password_resets;
DROP TABLE IF EXISTS public.email_verifications;
DROP TABLE IF EXISTS public.refresh_tokens;
DROP TABLE IF EXISTS public.user_tenants;
DROP TABLE IF EXISTS public.audit_logs;
DROP TABLE IF EXISTS public.platform_role_permissions;
DROP TABLE IF EXISTS public.platform_permissions;
DROP TABLE IF EXISTS public.platform_roles;
DROP TABLE IF EXISTS public.tenant_role_permissions;
DROP TABLE IF EXISTS public.tenant_permissions;
DROP TABLE IF EXISTS public.tenant_roles;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.tenants;

-- Drop ENUMs
DROP TYPE IF EXISTS refresh_token_type;
DROP TYPE IF EXISTS invitation_status;
DROP TYPE IF EXISTS tenant_plan;

COMMIT;
*/

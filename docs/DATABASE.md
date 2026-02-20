# Database Schema Documentation

Complete database schema documentation for Complytude's multi-tenant architecture.

## Table of Contents

- [Overview](#overview)
- [ER Diagram](#er-diagram)
- [Database Architecture](#database-architecture)
- [Table Groups](#table-groups)
- [Core Tables](#core-tables)
- [Authentication Tables](#authentication-tables)
- [Global Reference Tables](#global-reference-tables)
- [Tenant-Scoped Tables](#tenant-scoped-tables)
- [Row-Level Security (RLS)](#row-level-security-rls)
- [Indexes and Performance](#indexes-and-performance)
- [Migrations](#migrations)

---

## Overview

Complytude uses a **PostgreSQL 16** database with a multi-tenant architecture featuring:

- **Row-Level Security (RLS)** for tenant data isolation
- **Global reference tables** shared across all tenants
- **Tenant-scoped tables** with automatic isolation via RLS policies
- **Version control** for templates and rulesets
- **UUID primary keys** for all tables
- **JSONB fields** for flexible metadata and features

### Key Statistics

| Metric               | Count |
| -------------------- | ----- |
| Total Tables         | 38    |
| Core Tables          | 3     |
| Tenant RBAC Tables   | 3     |
| Platform RBAC Tables | 3     |
| Auth Tables          | 4     |
| Entitlement Tables   | 14    |
| Global Tables        | 6     |
| Tenant-Scoped Tables | 2     |
| Junction Tables      | 4     |
| Audit Tables         | 1     |
| Enums                | 9     |

---

## ER Diagram

### Viewing the Diagram

The complete ER diagram is available in DBML format:

**📁 File:** `docs/database-schema.dbml`

**To view:**

1. Go to [dbdiagram.io](https://dbdiagram.io/)
2. Copy the contents of `database-schema.dbml`
3. Paste into the editor
4. The diagram will render automatically

**Export Options:**

- PNG (for documentation)
- PDF (for printing)
- SVG (for presentations)

### Diagram Preview

The diagram shows:

- All 16 tables with columns and data types
- Relationships (foreign keys) with cardinality
- Table groups color-coded by purpose
- Indexes and constraints
- RLS policies on tenant-scoped tables

---

## Database Architecture

### Multi-Tenancy Strategy

Complytude implements **Row-Level Security (RLS)** for tenant isolation:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  Sets session context: app.tenant_id, app.is_auth_flow,      │
│                       app.user_tenant_role                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                PostgreSQL Row-Level Security                 │
│  Automatically filters rows based on session context         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Database Tables                           │
│  • Global Tables (no RLS) - shared reference data           │
│  • Tenant-Scoped Tables (RLS enabled) - isolated per tenant │
└─────────────────────────────────────────────────────────────┘
```

### Session Context

Before executing queries, the application sets session variables:

```sql
SELECT set_config('app.tenant_id', 'tenant-uuid', true);
SELECT set_config('app.user_id', 'user-uuid', true);
SELECT set_config('app.role', 'admin', true);
```

RLS policies use these to filter data automatically.

---

## Table Groups

### 1. Core Multi-Tenancy

Tables that define the multi-tenant structure:

- `tenants` - Organizations using the platform
- `users` - User accounts (can belong to multiple tenants)
- `user_tenants` - Many-to-many relationship with roles

### 2. Entitlement System (NEW)

Production-grade entitlement engine with usage tracking and credit system:

**Catalog Tables (Global, No RLS):**

- `features` - Feature catalog with typed definitions (boolean, quota, capacity, etc.) and credit costs
  - `credit_cost` column: Cost in credits per unit (e.g., 5 credits for documents, 3 credits for queries)
  - NULL for non-creditable features
- `plans` - Subscription plan definitions (Navigator, Shield, General Counsel, Infrastructure)
- `plan_entitlements` - Feature limits per plan
- `addons` - Purchasable add-ons
- `addon_entitlements` - Feature limits per add-on

**Tenant-Scoped Tables (RLS Enabled):**

- `tenant_subscriptions` - Active subscription binding with billing periods
- `tenant_addons` - Active add-on bindings
- `tenant_overrides` - Admin-applied entitlement overrides

**Event Ledgers (Append-Only, RLS Enabled):**

- `usage_ledger` - Usage event store (source of truth)
  - Metadata includes `credit_cost_per_unit` and `total_credits_deducted` when credits are used
- `usage_allocations` - Source attribution for each usage event (plan/addon/credit/override)
- `credit_ledger` - Credit transaction ledger (purchase, grant, deduction, refund)
  - Metadata includes `credit_cost_per_unit` and `units_consumed` for deduction transactions

**Projections & Snapshots (Performance Cache):**

- `aggregated_usage` - Derived usage counts per billing period
- `entitlement_snapshots` - Cached effective entitlements (24h TTL)

**Domain Events (Audit Trail):**

- `domain_events` - Immutable event log for domain-level auditing
  - `credit.deducted` events include `credit_cost_per_unit` and `units_consumed` in payload

**See [ENTITLEMENTS.md](./ENTITLEMENTS.md) for complete documentation.**

### 3. Authentication

Tables for JWT-based authentication and user onboarding:

- `refresh_tokens` - Session management (stores both identity and tenant refresh tokens)
- `email_verifications` - Email verification flow
- `password_resets` - Password reset flow
- `invitations` - Tenant invitation management

**Note:** The application uses a **dual-token authentication flow**:

1. Login → `identityAccessToken` + `identityRefreshToken` cookies (15 min / 14 days)
2. Tenant selection → `tenantAccessToken` + `tenantRefreshToken` cookies (30 min / 14 days)
3. All refresh tokens are stored in the `refresh_tokens` table with type tracking (`identity` or `tenant`)

### 4. Global Reference Data

Shared tables (no RLS):

- `authorities` - UAE legal authorities (DMCC, IFZA, etc.)
- `categories` - Template categories
- `rulesets` - Legal ruleset definitions
- `ruleset_versions` - Ruleset version history
- `templates` - Template metadata
- `template_versions` - Template version history

### 5. Junction Tables

Many-to-many relationships:

- `template_rulesets` - Templates ↔ Rulesets
- `template_version_ruleset_versions` - Version-level associations
- `role_permissions` - Tenant Roles ↔ Tenant Permissions
- `platform_role_permissions` - Platform Roles ↔ Platform Permissions

### 6. Tenant-Scoped Data (RLS)

Tables with tenant isolation:

- `documents` - Generated documents (tenant-specific)

---

## Core Tables

### tenants

Organizations using the platform.

| Column       | Type        | Description                                                     |
| ------------ | ----------- | --------------------------------------------------------------- |
| `id`         | UUID        | Primary key                                                     |
| `plan`       | ENUM        | Subscription plan: `early_access`, `basic`, `pro`, `enterprise` |
| `features`   | JSONB       | Feature flags (e.g., `{"api_access": true}`)                    |
| `is_active`  | BOOLEAN     | Soft delete flag                                                |
| `created_at` | TIMESTAMPTZ | Creation timestamp                                              |
| `updated_at` | TIMESTAMPTZ | Last update timestamp                                           |

**Indexes:**

- `idx_tenants_plan` - Filter by plan
- `idx_tenants_is_active` - Active tenants only (partial)

### users

User accounts that can access multiple tenants.

| Column              | Type         | Description                                                                                |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `id`                | UUID         | Primary key                                                                                |
| `email`             | VARCHAR(255) | Unique email address                                                                       |
| `password_hash`     | VARCHAR(255) | Bcrypt hashed password                                                                     |
| `first_name`        | VARCHAR(255) | First name                                                                                 |
| `last_name`         | VARCHAR(255) | Last name                                                                                  |
| `is_verified`       | BOOLEAN      | Email verification status                                                                  |
| `platform_role_key` | VARCHAR(50)  | Platform role key (e.g., `system_admin`, `support`, `auditor`). NULL for tenant-only users |
| `created_at`        | TIMESTAMPTZ  | Creation timestamp                                                                         |
| `updated_at`        | TIMESTAMPTZ  | Last update timestamp                                                                      |

**Indexes:**

- Unique constraint on `email` (creates implicit index)

### user_tenants

Many-to-many relationship: users belong to tenants with role assignments.

| Column       | Type        | Description                                                |
| ------------ | ----------- | ---------------------------------------------------------- |
| `user_id`    | UUID        | FK to users                                                |
| `tenant_id`  | UUID        | FK to tenants                                              |
| `role_key`   | VARCHAR(50) | Role key (e.g., `tenant_admin`, `legal_counsel`, `member`) |
| `is_active`  | BOOLEAN     | Active membership flag                                     |
| `joined_at`  | TIMESTAMPTZ | When user joined tenant                                    |
| `updated_at` | TIMESTAMPTZ | Last update timestamp                                      |

**Primary Key:** `(user_id, tenant_id)`

**Indexes:**

- `idx_user_tenants_user_id`
- `idx_user_tenants_tenant_id`
- `idx_user_tenants_tenant_active` - Optimizes RLS queries

**System Roles:**

- `tenant_admin` - Full access (`*:*`)
- `legal_counsel` - AI drafting, analysis, templates, regulatory
- `member` - Basic document creation and viewing
- `viewer` - Read-only access

---

## RBAC Tables

Tables for **Tenant RBAC** and **Platform RBAC** with permission-based authorization.

> **📖 Complete RBAC Documentation:** See [RBAC.md](RBAC.md) for comprehensive guide on both Tenant and Platform RBAC systems, including permissions, roles, and implementation examples.

### Automatic Synchronization

**Important:** RBAC tables are **automatically synchronized** from code constants on every application startup. You should never manually insert or update these records.

**Tenant RBAC Sync:**
- Service: `TenantRbacSyncService`
- Source: `TENANT_PERMISSIONS` object (single source) and `TENANT_SYSTEM_ROLE_PERMISSIONS` map
- Derived: `ALL_TENANT_PERMISSIONS` array (automatically generated from object)
- Tables: `tenant_permissions`, `tenant_roles`, `tenant_role_permissions`

**Platform RBAC Sync:**
- Service: `PlatformRbacSyncService`
- Source: `PLATFORM_PERMISSIONS` object (single source) and `PLATFORM_SYSTEM_ROLE_PERMISSIONS` map
- Derived: `ALL_PLATFORM_PERMISSIONS` array (automatically generated from object)
- Tables: `platform_permissions`, `platform_roles`, `platform_role_permissions`

**Sync Behavior:**
- **Permissions:** Add new, update existing, delete removed
- **System Roles:** Add new, update existing, sync role-permission mappings
- **Custom Roles:** Never touched

### tenant_roles

Tenant roles with support for custom roles (MVP+).

| Column        | Type         | Description                                             |
| ------------- | ------------ | ------------------------------------------------------- |
| `id`          | UUID         | Primary key                                             |
| `key`         | VARCHAR(50)  | Role key (e.g., `tenant_admin`, `legal_counsel`)        |
| `name`        | VARCHAR(100) | Display name (e.g., `Tenant Admin`)                     |
| `description` | TEXT         | Role description                                        |
| `tenant_id`   | UUID         | NULL for system roles, UUID for custom tenant roles     |
| `is_system`   | BOOLEAN      | TRUE for base roles (tenant_admin, legal_counsel, etc.) |
| `is_active`   | BOOLEAN      | Active status                                           |
| `created_at`  | TIMESTAMPTZ  | Creation timestamp                                      |
| `updated_at`  | TIMESTAMPTZ  | Last update timestamp                                   |

**Indexes:**

- `idx_tenant_roles_key_tenant` - Unique constraint on (key, tenant_id)
- `idx_tenant_roles_tenant_id` - Filter by tenant
- `idx_tenant_roles_is_system` - Filter system roles

**System Roles (synced from code):**

| Key             | Name          | Permissions (in-memory)                                                   | Description                                  |
| --------------- | ------------- | ------------------------------------------------------------------------- | -------------------------------------------- |
| `tenant_admin`  | Tenant Admin  | `*:*` (wildcard)                                                          | Full access to all tenant features           |
| `legal_counsel` | Legal Counsel | `documents:*`, `contracts:*`, `templates:*`, `regulatory:query`           | AI drafting, analysis, templates, regulatory |
| `member`        | Member        | `documents:create`, `documents:read`, `templates:use`, `regulatory:query` | Basic document creation and viewing          |
| `viewer`        | Viewer        | `documents:read`, `regulatory:query`                                      | Read-only access                             |

**Note:** System roles use wildcards (e.g., `documents:*`) for cleaner permission sets. Permission matching handles wildcard expansion at runtime.

**Constraints:**

- Custom roles cannot use reserved system role keys
- System roles have `tenant_id = NULL` and `is_system = TRUE`

### tenant_permissions

Tenant-level permissions for RBAC. **Automatically synced from `TENANT_PERMISSIONS` object (via derived `ALL_TENANT_PERMISSIONS` array).**

| Column        | Type         | Description                               |
| ------------- | ------------ | ----------------------------------------- |
| `id`          | UUID         | Primary key                               |
| `key`         | VARCHAR(100) | Permission key (e.g., `documents:create`) |
| `name`        | VARCHAR(100) | Display name (e.g., `Create Documents`)   |
| `resource`    | VARCHAR(50)  | Resource type (e.g., `documents`, `*`)    |
| `action`      | VARCHAR(50)  | Action type (e.g., `create`, `*`)         |
| `description` | TEXT         | Permission description                    |
| `created_at`  | TIMESTAMPTZ  | Creation timestamp                        |

**Indexes:**

- Unique constraint on `key`
- `idx_tenant_permissions_resource` - Filter by resource

**Available Permissions (synced from code):**

| Resource     | Permissions                                                             |
| ------------ | ----------------------------------------------------------------------- |
| `documents`  | `documents:create`, `documents:read`, `documents:delete`, `documents:*` |
| `contracts`  | `contracts:analyze`, `contracts:redline`, `contracts:*`                 |
| `templates`  | `templates:manage`, `templates:use`, `templates:*`                      |
| `regulatory` | `regulatory:query`, `regulatory:*`                                      |
| `billing`    | `billing:manage`, `billing:*`                                           |
| `team`       | `team:manage`, `team:*`                                                 |
| `settings`   | `settings:manage`, `settings:change_jurisdiction`, `settings:*`         |
| `*` (cross)  | `*:read`, `*:manage`, `*:*`                                             |

**Wildcard Permissions:**

- `documents:*` - All document permissions (stored as real permission)
- `*:read` - Read permission on all resources (stored as real permission)
- `*:manage` - Manage permission on all resources (stored as real permission)
- `*:*` - All permissions (tenant_admin only)

### tenant_role_permissions

Many-to-many relationship between tenant roles and tenant permissions.

| Column          | Type        | Description               |
| --------------- | ----------- | ------------------------- |
| `role_id`       | UUID        | FK to tenant_roles        |
| `permission_id` | UUID        | FK to tenant_permissions  |
| `created_at`    | TIMESTAMPTZ | Creation timestamp |

**Primary Key:** `(role_id, permission_id)`

**Indexes:**

- `idx_tenant_role_permissions_role_id` - Filter by role
- `idx_tenant_role_permissions_permission_id` - Filter by permission

**Note:** System roles use in-memory permission sets (`TENANT_SYSTEM_ROLE_PERMISSIONS`) for performance - no database query needed. The database entries exist for:

1. UI display (listing available roles)
2. Custom tenant roles (MVP+ feature)
3. Role-permission audit trail

---

## Platform RBAC Tables

Tables for platform-wide authorization (system administration, tenant management).

### platform_roles

Platform-level roles for system-wide access control.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `key` | VARCHAR(50) | Role key (e.g., `system_admin`, `support`, `auditor`) |
| `name` | VARCHAR(100) | Display name (e.g., `System Admin`) |
| `description` | TEXT | Role description |
| `is_system` | BOOLEAN | TRUE for system roles, FALSE for custom platform roles |
| `is_active` | BOOLEAN | Active status |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Indexes:**

- Unique constraint on `key`
- `idx_platform_roles_is_system` - Filter system roles

**System Roles (synced from code):**

| Key | Name | Permissions | Description |
|-----|------|-------------|-------------|
| `system_admin` | System Admin | `*:*` | Full access to all platform features |
| `support` | Support | Read-only permissions | Customer support access |
| `auditor` | Auditor | Audit-focused permissions | Audit and compliance access |

### platform_permissions

Platform-level permissions for system-wide RBAC.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `key` | VARCHAR(100) | Permission key (e.g., `tenants:create`, `users:manage_roles`) |
| `name` | VARCHAR(100) | Display name (e.g., `Create Tenants`) |
| `resource` | VARCHAR(50) | Resource type (e.g., `tenants`, `users`) |
| `action` | VARCHAR(50) | Action type (e.g., `create`, `manage`) |
| `description` | TEXT | Permission description |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Indexes:**

- Unique constraint on `key`
- `idx_platform_permissions_resource` - Filter by resource
- `idx_platform_permissions_resource_action` - Composite index

**Available Permissions (synced from code):**

| Resource | Permissions |
|----------|-------------|
| `tenants` | `tenants:create`, `tenants:read`, `tenants:update`, `tenants:delete`, `tenants:*` |
| `users` | `users:read`, `users:update`, `users:delete`, `users:manage_roles`, `users:*` |
| `plans` | `plans:read`, `plans:manage`, `plans:*` |
| `subscriptions` | `subscriptions:read`, `subscriptions:manage`, `subscriptions:*` |
| `templates` | `templates:read`, `templates:manage`, `templates:*` |
| `rulesets` | `rulesets:read`, `rulesets:manage`, `rulesets:*` |
| `authorities` | `authorities:read`, `authorities:manage`, `authorities:*` |
| `categories` | `categories:read`, `categories:manage`, `categories:*` |
| `entitlements` | `entitlements:read`, `entitlements:manage`, `entitlements:*` |
| `audit` | `audit:read`, `audit:*` |
| `support` | `support:access`, `support:impersonate`, `support:*` |
| `*` (cross) | `*:read`, `*:manage`, `*:*` |

### platform_role_permissions

Many-to-many relationship between platform roles and permissions.

| Column | Type | Description |
|--------|------|-------------|
| `role_id` | UUID | FK to platform_roles |
| `permission_id` | UUID | FK to platform_permissions |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Primary Key:** `(role_id, permission_id)`

**Note:** System roles use in-memory permission sets (`PLATFORM_SYSTEM_ROLE_PERMISSIONS`) for performance - no database query needed.

---

## Authentication Tables

### refresh_tokens

JWT refresh tokens for session management (both identity and tenant tokens).

| Column       | Type         | Description                                                   |
| ------------ | ------------ | ------------------------------------------------------------- |
| `id`         | UUID         | Primary key                                                   |
| `user_id`    | UUID         | FK to users                                                   |
| `token_hash` | VARCHAR(255) | Hashed refresh token                                          |
| `token_type` | VARCHAR(20)  | Token type: `identity` or `tenant` (default: `tenant`)        |
| `tenant_id`  | UUID         | FK to tenants (NULL for identity tokens, required for tenant) |
| `expires_at` | TIMESTAMPTZ  | Token expiration                                              |
| `created_at` | TIMESTAMPTZ  | Creation timestamp                                            |
| `revoked_at` | TIMESTAMPTZ  | Revocation timestamp (NULL if valid)                          |

**Indexes:**

- `idx_refresh_tokens_user_type_tenant` - Composite index on (user_id, token_type, tenant_id)

**Token Types:**

- **Identity tokens:** `token_type = 'identity'`, `tenant_id = NULL` - Used for user identity verification
- **Tenant tokens:** `token_type = 'tenant'`, `tenant_id = <uuid>` - Used for tenant-scoped access

### email_verifications

Email verification tokens sent during signup.

| Column        | Type         | Description                              |
| ------------- | ------------ | ---------------------------------------- |
| `id`          | UUID         | Primary key                              |
| `user_id`     | UUID         | FK to users                              |
| `token`       | VARCHAR(255) | Unique verification token                |
| `expires_at`  | TIMESTAMPTZ  | Token expiration                         |
| `created_at`  | TIMESTAMPTZ  | Creation timestamp                       |
| `verified_at` | TIMESTAMPTZ  | Verification timestamp (NULL if pending) |

### password_resets

Password reset tokens for forgot-password flow.

| Column       | Type         | Description                          |
| ------------ | ------------ | ------------------------------------ |
| `id`         | UUID         | Primary key                          |
| `user_id`    | UUID         | FK to users                          |
| `token`      | VARCHAR(255) | Unique reset token                   |
| `expires_at` | TIMESTAMPTZ  | Token expiration                     |
| `created_at` | TIMESTAMPTZ  | Creation timestamp                   |
| `used_at`    | TIMESTAMPTZ  | When token was used (NULL if unused) |

### invitations

Tenant invitations for inviting users to join organizations.

| Column        | Type         | Description                                                     |
| ------------- | ------------ | --------------------------------------------------------------- |
| `id`          | UUID         | Primary key                                                     |
| `email`       | VARCHAR(255) | Email address of invited user                                   |
| `tenant_id`   | UUID         | FK to tenants (organization inviting the user)                  |
| `token_hash`  | VARCHAR(255) | Hashed invitation token                                         |
| `invited_by`  | UUID         | FK to users (who sent the invitation)                           |
| `expires_at`  | TIMESTAMPTZ  | Token expiration                                                |
| `accepted_at` | TIMESTAMPTZ  | When invitation was accepted (NULL if pending)                  |
| `rejected_at` | TIMESTAMPTZ  | When invitation was rejected (NULL if not rejected)             |
| `revoked_at`  | TIMESTAMPTZ  | When invitation was revoked by admin (NULL if active)           |
| `revoked_by`  | UUID         | FK to users (who revoked the invitation)                        |
| `role`        | VARCHAR(50)  | Role key to assign (e.g., `member`, `legal_counsel`)            |
| `status`      | ENUM         | Status: `pending`, `accepted`, `rejected`, `revoked`, `expired` |
| `created_at`  | TIMESTAMPTZ  | Creation timestamp                                              |
| `updated_at`  | TIMESTAMPTZ  | Last update timestamp                                           |

**Indexes:**

- `idx_invitations_token_hash` - Fast token lookup
- `idx_invitations_email` - Filter by email
- `idx_invitations_tenant_id` - Filter by tenant
- `idx_invitations_invited_by` - Track who invited
- `idx_invitations_status` - Filter by status
- `idx_invitations_email_status` - Composite for queries
- `idx_invitations_email_tenant_pending` - Unique constraint (one pending invitation per email per tenant)

**Business Rules:**

- Only one pending invitation per email per tenant
- Invitations expire after a configured period (default: 7 days)
- Accepted invitations create a `user_tenants` record
- Status transitions: `pending` → `accepted`/`rejected`/`revoked`/`expired`

---

## Global Reference Tables

These tables are **shared across all tenants** and have **no RLS policies**.

### authorities

UAE legal authorities (DMCC, IFZA, DED, RAKEZ, etc.).

| Column        | Type         | Description                |
| ------------- | ------------ | -------------------------- |
| `id`          | UUID         | Primary key                |
| `code`        | VARCHAR(50)  | Unique code (e.g., "DMCC") |
| `name`        | VARCHAR(255) | Full name                  |
| `description` | TEXT         | Authority description      |
| `country`     | VARCHAR(100) | Country (default: "UAE")   |
| `is_active`   | BOOLEAN      | Active status              |

### categories

Hierarchical template categories.

| Column        | Type         | Description                           |
| ------------- | ------------ | ------------------------------------- |
| `id`          | UUID         | Primary key                           |
| `code`        | VARCHAR(50)  | Unique code                           |
| `name`        | VARCHAR(255) | Category name                         |
| `description` | TEXT         | Category description                  |
| `parent_id`   | UUID         | Parent category (self-referencing FK) |
| `is_active`   | BOOLEAN      | Active status                         |

### templates

Template metadata and version control.

| Column            | Type         | Description                                 |
| ----------------- | ------------ | ------------------------------------------- |
| `id`              | UUID         | Primary key                                 |
| `key`             | VARCHAR(255) | Unique key (e.g., "dmcc_employment_v1")     |
| `name`            | VARCHAR(255) | Template name                               |
| `category_id`     | UUID         | FK to categories                            |
| `authority_id`    | UUID         | FK to authorities                           |
| `languages`       | TEXT[]       | Supported languages (e.g., `['en', 'ar']`)  |
| `current_version` | VARCHAR(50)  | Current active version                      |
| `status`          | ENUM         | `active`, `inactive`, `draft`, `deprecated` |
| `file_url`        | TEXT         | S3 URL to DOCX file                         |
| `metadata`        | JSONB        | Additional metadata                         |
| `created_by`      | UUID         | FK to users                                 |

**Automatic Version Sync:**
When a new `template_version` is created with `is_active = true`, a trigger automatically updates `templates.current_version` and `templates.file_url`.

### template_versions

Immutable version history for templates.

| Column        | Type        | Description                        |
| ------------- | ----------- | ---------------------------------- |
| `id`          | UUID        | Primary key                        |
| `template_id` | UUID        | FK to templates                    |
| `version`     | VARCHAR(50) | Version number (e.g., "1.0.0")     |
| `fields`      | JSONB       | Field definitions for this version |
| `file_url`    | TEXT        | S3 URL to this version's DOCX file |
| `changelog`   | TEXT        | Description of changes             |
| `is_active`   | BOOLEAN     | Whether this is the active version |
| `created_by`  | UUID        | FK to users                        |

**Unique Constraint:** `(template_id, version)`

### rulesets

Legal rulesets containing authority-specific clauses.

Similar structure to `templates` with version control.

### ruleset_versions

Version history for rulesets.

Similar structure to `template_versions`.

---

## Tenant-Scoped Tables

These tables have **Row-Level Security (RLS) enabled** for tenant isolation.

### documents

Tenant-specific generated documents.

| Column                | Type         | Description                                |
| --------------------- | ------------ | ------------------------------------------ |
| `id`                  | UUID         | Primary key                                |
| `tenant_id`           | UUID         | **RLS isolation key** (FK to tenants)      |
| `title`               | VARCHAR(255) | Document title                             |
| `content`             | TEXT         | Document content                           |
| `metadata`            | JSONB        | Tags, custom fields, etc.                  |
| `template_id`         | UUID         | FK to templates (which template was used)  |
| `template_version_id` | UUID         | FK to template_versions (specific version) |
| `generation_metadata` | JSONB        | AI model, parameters, etc.                 |
| `created_by`          | UUID         | FK to users                                |
| `created_at`          | TIMESTAMPTZ  | Creation timestamp                         |
| `updated_at`          | TIMESTAMPTZ  | Last update timestamp                      |

**Critical Index:**

- `idx_documents_tenant_id` - **Required for RLS performance**

**RLS Policies:**

```sql
-- SELECT Policy
CREATE POLICY documents_select ON documents
FOR SELECT USING (
    tenant_id = current_tenant_id_or_null()
);

-- INSERT Policy
CREATE POLICY documents_insert ON documents
FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id_or_null()
);
```

**What this means:**

- Users can only see documents for their current tenant
- Users can only create documents for their current tenant
- No cross-tenant data access is possible

---

## Row-Level Security (RLS)

### How RLS Works

1. **Application sets session context** before queries:

   ```typescript
   await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
   ```

2. **PostgreSQL applies policies automatically:**

   ```sql
   -- User executes:
   SELECT * FROM documents;

   -- PostgreSQL converts to:
   SELECT * FROM documents
   WHERE tenant_id = current_setting('app.tenant_id');
   ```

3. **Result:** Users only see their tenant's data

### Session Context Functions

Helper functions for RLS policies:

```sql
-- Get current tenant ID from session
CREATE FUNCTION current_tenant_id_or_null() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.tenant_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get current user ID from session
CREATE FUNCTION current_user_id_or_null() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.user_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get current role from session
CREATE FUNCTION current_user_role_or_null() RETURNS tenant_role AS $$
BEGIN
    RETURN current_setting('app.role', true)::tenant_role;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
```

### Verifying RLS

To verify tenant isolation:

```sql
-- Connect as app user
\c complytude complytude_app

-- Set context for Tenant 1
SELECT set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', false);

-- Query documents (should only see Tenant 1's documents)
SELECT * FROM documents;

-- Change to Tenant 2
SELECT set_config('app.tenant_id', '22222222-2222-4222-8222-222222222222', false);

-- Query again (should see different documents)
SELECT * FROM documents;
```

---

## Indexes and Performance

### Index Strategy

1. **Primary Keys:** All tables use UUID with default `gen_random_uuid()`
2. **Foreign Keys:** Indexed automatically
3. **RLS Optimization:** Composite indexes for tenant-scoped queries
4. **Partial Indexes:** Used for common filters (e.g., `WHERE is_active = true`)
5. **GIN Indexes:** For array fields (e.g., `languages`)

### Critical Indexes

#### Tenant Isolation

```sql
-- Critical for RLS performance on documents
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);

-- Composite for tenant-scoped queries
CREATE INDEX idx_documents_tenant_created
ON documents(tenant_id, created_at DESC);
```

#### User-Tenant Relationships

```sql
-- Optimizes RLS policy checks
CREATE INDEX idx_user_tenants_tenant_active
ON user_tenants(tenant_id, is_active)
WHERE is_active = true;
```

### Performance Tips

1. **Always filter by `tenant_id`** in application queries (even though RLS does it automatically)
2. **Use composite indexes** for common query patterns
3. **Leverage partial indexes** for frequently filtered columns
4. **Monitor slow queries** with `pg_stat_statements`

---

## Migrations

### Migration Files

Database schema is managed through versioned migration files:

**Location:** `scripts/migrations/`

| #   | File                                        | Description                                                 |
| --- | ------------------------------------------- | ----------------------------------------------------------- |
| 001 | `core_tables.sql`                           | Tenants, users, user_tenants, auth tables                   |
| 002 | `grants_to_app_user.sql`                    | Grant permissions to app user                               |
| 003 | `session_context_contract.sql`              | RLS helper functions                                        |
| 004 | `rls_enablement.sql`                        | Enable RLS on tables                                        |
| 005 | `rls_policies_core.sql`                     | Create RLS policies                                         |
| 006 | `global_tables.sql`                         | Authorities, categories, templates, rulesets                |
| 007 | `documents_table.sql`                       | Documents table with RLS                                    |
| 008 | `grants_global_tables.sql`                  | Permissions for global tables                               |
| 009 | `entitlement_tables.sql`                    | Entitlement system tables (features, plans, usage, credits) |
| 010 | `entitlement_tables_grants_to_app_user.sql` | Grants for entitlement tables                               |
| 011 | `entitlement_tables_rls_enablement.sql`     | RLS on tenant-scoped entitlement tables                     |
| 012 | `entitlement_tables_rls_policies.sql`       | RLS policies for entitlement tables                         |

### Running Migrations

```bash
# Run all migrations
pnpm db:migrate

# Or use the script directly
./scripts/run-migrations.sh
```

### Migration Tracking

Executed migrations are tracked in `public.schema_migrations`:

```sql
SELECT migration_name, executed_at
FROM schema_migrations
ORDER BY executed_at DESC;
```

### Creating New Migrations

1. Create file: `scripts/migrations/009_description.sql`
2. Follow naming convention: `00X_description.sql`
3. Include BEGIN/COMMIT for transactions
4. Make it idempotent (use `IF NOT EXISTS`)
5. Run: `pnpm db:migrate`

**Template:**

```sql
BEGIN;

-- =========================
-- Migration 009: Description
-- =========================

CREATE TABLE IF NOT EXISTS your_table (...);

COMMIT;
```

---

## Related Documentation

- [QUICK_START.md](../scripts/QUICK_START.md) - Database setup guide
- [scripts/README.md](../scripts/README.md) - Migration and seed documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture overview
- [ENTITLEMENTS.md](ENTITLEMENTS.md) - Entitlement system documentation
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflow

---

## Schema Maintenance

### Backup Strategy

```bash
# Backup schema only
pg_dump -s complytude > schema_backup.sql

# Backup schema + data
pg_dump complytude > full_backup.sql
```

### Schema Verification

```bash
# Verify RLS is enabled
psql -d complytude -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true;
"

# Check table sizes
psql -d complytude -c "
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

---

**Last Updated:** February 18, 2026

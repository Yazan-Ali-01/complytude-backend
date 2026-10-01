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
| Enums                | 11    |

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

- All 38+ tables with columns and data types
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

The application uses `DatabaseService` transaction methods which automatically set session variables:

**`transactionWithTenantContext({ tenantId, allowCrossTenantRead? })`:**

```sql
SELECT set_config('app.tenant_id', 'tenant-uuid', true);        -- Always set
SELECT set_config('app.allow_cross_tenant_read', 'true/false', true); -- For cross-tenant reads
```

**`transactionWithPlatformAdminContext()`:**

```sql
SELECT set_config('app.platform_role', 'true', true);  -- Bypasses tenant RLS
```

All variables are transaction-scoped (`is_local=true`) — they clear on COMMIT/ROLLBACK. RLS policies use helper functions to read these variables.

### Testing Policies

Integration tests run the app as a non-superuser role (`app_login`, a member of `app_user`), so RLS applies as it does in deployed environments. `apps/api/test/rls/tenant-isolation.integration.spec.ts` has one case per policy, checks that no tenant can read or write another tenant's rows, and fails if any policy can be dropped without a test noticing or if a policy has no case. Add a case there when you add or change a policy; see `apps/api/test/README.md`.

`audit_logs` has RLS too (migration 029): a tenant context reads and writes only its own rows;
rows with no tenant (system and identity-level events) are written and read in platform-admin
context. `AuditLogsRepository` picks the context from each row's `tenant_id`. `app_user` has only
`SELECT, INSERT` on it, so the application can't change or delete history. `actor_type` is
`user`, `system`, `api_key` or `anonymous` (migration 032: a caller who is not signed in; `actor_id`
is then the account concerned when known, and an email that matches no account is kept only as
a SHA-256 hash in `details.emailHash`). Retention of audit rows is not decided yet.

`BaseRepository` refuses to run a query on a table with RLS unless it gets `{ client }` from one of the context transactions above or `{ tenant }`: it throws rather than let the query return no rows. The tables are listed in `RLS_TABLES` (`libs/database/src/base/rls-tables.ts`); the RLS suite fails if that list and the database disagree, so update it when you enable RLS on a table.

`BaseRepository.create`, `createWithId`, `update` and `findOne` build column names from object keys. Each must be a bare snake_case identifier, and it is double-quoted; anything else is refused before a query is sent. A repository whose data comes from a request DTO also declares `writableColumns` (authorities, categories), and the base methods then write only those columns. Debug logs carry a query's SQL and parameter count, never parameter values.

If `ROLLBACK` fails after an error in a transaction helper, the helper logs it, releases the client with that error (pg destroys the connection instead of pooling it) and rethrows the original error.

### Runtime role privileges

The application connects as `app_login`, a member of `app_user`. `app_user` may not create objects in `public` (migration 028) and has, per table, only the operations the code performs (migration 038): catalogs the app never writes (`addon_entitlements`, `template_version_ruleset_versions`) are read-only, `addons` only takes updates (Stripe catalog sync), nothing deletes plans, features, rulesets, templates' versions or Stripe events, and link tables filled with `ON CONFLICT DO NOTHING` have no `UPDATE`. `apps/api/test/rls/app-role-privileges.integration.spec.ts` pins the full map: when a feature needs a new privilege, grant it in a new migration and update the map there. The API still writes most catalogs itself (startup syncs, platform-admin endpoints); moving those writes to a separate role is not done yet.

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
- `usage_allocations` - Source attribution for each usage event (plan/addon/credit/override). RLS (migration 042): it has no `tenant_id`, so a row is visible and insertable only where its `usage_ledger` row is (that row's tenant, or platform context); no UPDATE or DELETE for the app role
- `credit_ledger` - Credit transaction ledger (purchase, grant, deduction, refund)
  - Metadata includes `credit_cost_per_unit` and `units_consumed` for deduction transactions

**Projections & Snapshots (Performance Cache):**

- `aggregated_usage` - Derived usage counts per billing period (unique on subscription, feature and period; the period key is `current_period_start` in UTC to the millisecond, migration 035)
- `entitlement_snapshots` - Cached effective entitlements (24h TTL)

**Domain Events (Audit Trail):**

- `domain_events` - Immutable event log for domain-level auditing
  - `credit.deducted` events include `credit_cost_per_unit` and `units_consumed` in payload

**See [ENTITLEMENTS.md](./ENTITLEMENTS.md) for complete documentation.**

### 3. Authentication

Tables for JWT-based authentication and user onboarding:

- `email_verifications` - Email verification flow
- `password_resets` - Password reset flow
- `invitations` - Tenant invitation management

**Note:** The application uses a **dual-token authentication flow** with **Redis-backed sessions** (identity + tenant session keys). Refresh JWTs are stateless and validated against live sessions in Redis (`sessionId` in JWT); there is **no** `refresh_tokens` PostgreSQL table.

1. Login → `identityAccessToken` + `identityRefreshToken` cookies (access TTL from env; refresh aligned with `SESSION_MAX_TTL`)
2. Tenant selection → `tenantAccessToken` + `tenantRefreshToken` cookies
3. Session lifecycle, revocation, and limits are enforced in Redis (see architecture / API docs)

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

Organizations using the platform. Plan assignment is managed via `tenant_subscriptions` (single source of truth).

| Column                    | Type         | Description                                       |
| ------------------------- | ------------ | ------------------------------------------------- |
| `id`                      | UUID         | Primary key                                       |
| `name`                    | VARCHAR(255) | Tenant name (NULL for anonymous tenants)          |
| `logo_url`                | TEXT         | Logo URL                                          |
| `brand_color_primary`     | VARCHAR(7)   | Primary brand color hex code                      |
| `brand_color_secondary`   | VARCHAR(7)   | Secondary brand color hex code                    |
| `contact_email`           | VARCHAR(255) | Contact email                                     |
| `billing_email`           | VARCHAR(255) | Billing email                                     |
| `contact_phone`           | VARCHAR(50)  | Contact phone                                     |
| `emirate`                 | VARCHAR(50)  | UAE emirate                                       |
| `city`                    | VARCHAR(100) | City                                              |
| `address_line_1`          | VARCHAR(500) | Address line 1                                    |
| `address_line_2`          | VARCHAR(500) | Address line 2                                    |
| `postal_code`             | VARCHAR(20)  | Postal code                                       |
| `trade_license_number`    | VARCHAR(100) | Trade license number                              |
| `legal_entity_type`       | VARCHAR(50)  | Legal entity type                                 |
| `tax_registration_number` | VARCHAR(100) | Tax registration number                           |
| `locale`                  | VARCHAR(50)  | Locale (default: `en`)                            |
| `timezone`                | VARCHAR(50)  | Timezone                                          |
| `default_jurisdiction`    | VARCHAR(100) | Default jurisdiction                              |
| `slug`                    | VARCHAR(255) | Unique URL slug                                   |
| `is_active`               | BOOLEAN      | Soft delete flag                                  |
| `parent_tenant_id`        | UUID         | FK to tenants (agency/partner hierarchy, MVP+)    |
| `onboarding_completed_at` | TIMESTAMPTZ  | When onboarding was completed                     |
| `onboarding_metadata`     | JSONB        | Onboarding progress metadata                      |
| `deactivated_at`          | TIMESTAMPTZ  | When tenant was deactivated                       |
| `deactivation_reason`     | TEXT         | Reason for deactivation                           |
| `created_at`              | TIMESTAMPTZ  | Creation timestamp                                |
| `updated_at`              | TIMESTAMPTZ  | Last update timestamp                             |

**Indexes:**

- `slug` (unique)
- `idx_tenants_is_active` - Active tenants only (partial)

> **Note:** The `tenants.plan` column and `tenant_plan` ENUM have been removed. Tenant plan assignment is now managed exclusively through `tenant_subscriptions`. See [Entitlement System](#entitlement-tables).

**Tenant creation flow:** When a tenant is created via `POST /tenants` (or `TenantService.createTenantForUser()`), a `tenant_subscriptions` row is created atomically within the same transaction. This ensures `getCurrentSubscription(tenantId)` works immediately and entitlement resolution does not throw `NotFoundException`. New tenants always start on a **14-day trial** of General Counsel (`status='trialing'`, `trial_ends_at = NOW() + 14 days`). Paid plans are granted only via Stripe Checkout + the `checkout.session.completed` webhook. The `trial_reminder_sent_at` column tracks one-shot delivery of the "trial ending soon" reminder email.

### tenant_ai_consents

Which version of the AI processing disclosure each organization accepted, who accepted it and when (migration 037). Analysis and uploads are refused until the current version (`AI_DISCLOSURE_VERSION`) is accepted; see `docs/SUBPROCESSORS.md`. Append-only: the app role may `SELECT` and `INSERT`, never update or delete. RLS: read and insert in the tenant's context (who may accept is tenant RBAC's `settings:manage`), or insert in platform context (organization setup).

| Column               | Type        | Description                                                        |
| -------------------- | ----------- | ------------------------------------------------------------------ |
| `id`                 | UUID        | Primary key                                                        |
| `tenant_id`          | UUID        | Organization (FK `tenants`, cascade delete)                        |
| `disclosure_version` | VARCHAR(32) | The version accepted; unique per tenant                            |
| `accepted_by`        | UUID        | The tenant admin who accepted (FK `users`, set NULL when deleted)  |
| `accepted_at`        | TIMESTAMPTZ | When                                                               |

### users

User accounts that can access multiple tenants.

| Column              | Type         | Description                                                                                |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `id`                | UUID         | Primary key                                                                                |
| `email`             | VARCHAR(255) | Unique email address, stored trimmed and lower-case (CHECK `users_email_lowercase`)       |
| `password_hash`     | VARCHAR(255) | Bcrypt hashed password; NULL for SSO-only accounts until a password is set                 |
| `first_name`        | VARCHAR(255) | First name                                                                                 |
| `last_name`         | VARCHAR(255) | Last name                                                                                  |
| `is_verified`       | BOOLEAN      | Email verification status                                                                  |
| `platform_role_key` | VARCHAR(50)  | Platform role key (e.g., `system_admin`, `support`, `auditor`). NULL for tenant-only users |
| `google_id`         | VARCHAR(255) | Google OAuth subject (`sub`); NULL if not linked                                           |
| `microsoft_id`      | VARCHAR(255) | Microsoft OAuth subject (`id`); NULL if not linked                                         |
| `auth_provider`     | VARCHAR(20)  | Primary signup method: `email`, `google`, or `microsoft`                                   |
| `created_at`        | TIMESTAMPTZ  | Creation timestamp                                                                         |
| `updated_at`        | TIMESTAMPTZ  | Last update timestamp                                                                      |

**Indexes:**

- Unique constraint on `email` (creates implicit index), and `users_email_lower_key` unique on `lower(email)`
- Partial unique index on `google_id` WHERE `google_id IS NOT NULL`
- Partial unique index on `microsoft_id` WHERE `microsoft_id IS NOT NULL`

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

RLS (migration 043): system roles (`tenant_id` NULL) are readable in any context and written only in platform context (the startup sync); a tenant's custom role is readable in its tenant's context, the auth flow and platform context, and written only in its tenant's context. The app role has no DELETE.

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

| Column          | Type        | Description              |
| --------------- | ----------- | ------------------------ |
| `role_id`       | UUID        | FK to tenant_roles       |
| `permission_id` | UUID        | FK to tenant_permissions |
| `created_at`    | TIMESTAMPTZ | Creation timestamp       |

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

| Column        | Type         | Description                                            |
| ------------- | ------------ | ------------------------------------------------------ |
| `id`          | UUID         | Primary key                                            |
| `key`         | VARCHAR(50)  | Role key (e.g., `system_admin`, `support`, `auditor`)  |
| `name`        | VARCHAR(100) | Display name (e.g., `System Admin`)                    |
| `description` | TEXT         | Role description                                       |
| `is_system`   | BOOLEAN      | TRUE for system roles, FALSE for custom platform roles |
| `is_active`   | BOOLEAN      | Active status                                          |
| `created_at`  | TIMESTAMPTZ  | Creation timestamp                                     |
| `updated_at`  | TIMESTAMPTZ  | Last update timestamp                                  |

**Indexes:**

- Unique constraint on `key`
- `idx_platform_roles_is_system` - Filter system roles

**System Roles (synced from code):**

| Key            | Name         | Permissions               | Description                          |
| -------------- | ------------ | ------------------------- | ------------------------------------ |
| `system_admin` | System Admin | `*:*`                     | Full access to all platform features |
| `support`      | Support      | Read-only permissions     | Customer support access              |
| `auditor`      | Auditor      | Audit-focused permissions | Audit and compliance access          |

### platform_permissions

Platform-level permissions for system-wide RBAC.

| Column        | Type         | Description                                                   |
| ------------- | ------------ | ------------------------------------------------------------- |
| `id`          | UUID         | Primary key                                                   |
| `key`         | VARCHAR(100) | Permission key (e.g., `tenants:create`, `users:manage_roles`) |
| `name`        | VARCHAR(100) | Display name (e.g., `Create Tenants`)                         |
| `resource`    | VARCHAR(50)  | Resource type (e.g., `tenants`, `users`)                      |
| `action`      | VARCHAR(50)  | Action type (e.g., `create`, `manage`)                        |
| `description` | TEXT         | Permission description                                        |
| `created_at`  | TIMESTAMPTZ  | Creation timestamp                                            |

**Indexes:**

- Unique constraint on `key`
- `idx_platform_permissions_resource` - Filter by resource
- `idx_platform_permissions_resource_action` - Composite index

**Available Permissions (synced from code):**

| Resource        | Permissions                                                                       |
| --------------- | --------------------------------------------------------------------------------- |
| `tenants`       | `tenants:create`, `tenants:read`, `tenants:update`, `tenants:delete`, `tenants:*` |
| `users`         | `users:read`, `users:update`, `users:delete`, `users:manage_roles`, `users:*`     |
| `plans`         | `plans:read`, `plans:manage`, `plans:*`                                           |
| `subscriptions` | `subscriptions:read`, `subscriptions:manage`, `subscriptions:*`                   |
| `templates`     | `templates:read`, `templates:manage`, `templates:*`                               |
| `rulesets`      | `rulesets:read`, `rulesets:manage`, `rulesets:*`                                  |
| `authorities`   | `authorities:read`, `authorities:manage`, `authorities:*`                         |
| `categories`    | `categories:read`, `categories:manage`, `categories:*`                            |
| `entitlements`  | `entitlements:read`, `entitlements:manage`, `entitlements:*`                      |
| `audit`         | `audit:read`, `audit:*`                                                           |
| `support`       | `support:access`, `support:impersonate`, `support:*`                              |
| `*` (cross)     | `*:read`, `*:manage`, `*:*`                                                       |

### platform_role_permissions

Many-to-many relationship between platform roles and permissions.

| Column          | Type        | Description                |
| --------------- | ----------- | -------------------------- |
| `role_id`       | UUID        | FK to platform_roles       |
| `permission_id` | UUID        | FK to platform_permissions |
| `created_at`    | TIMESTAMPTZ | Creation timestamp         |

**Primary Key:** `(role_id, permission_id)`

**Note:** System roles use in-memory permission sets (`PLATFORM_SYSTEM_ROLE_PERMISSIONS`) for performance - no database query needed.

---

## Authentication Tables

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
| `email`       | VARCHAR(255) | Email address of invited user, trimmed and lower-case (CHECK)   |
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

`jurisdictions` and `document_types` (text arrays, migration 033) say which contracts a ruleset applies to: an analysis given a jurisdiction and a document type searches only the active rulesets tagged with both. Codes are validated by the API (`ANALYSIS_JURISDICTIONS` / `ANALYSIS_DOCUMENT_TYPES` in `libs/queue`); an empty array means the ruleset is used only when picked explicitly.

Similar structure to `templates` with version control.

### ruleset_versions

Version history for rulesets. `clauses` stores the clause array (JSONB): each clause is one article or sub-article in its source's words (`content`), with `id`, `title`, `order`, `is_required` and, optionally, `article`, `section`, `severity` (`critical`/`high`/`medium`/`low`), `source_title`, `source_url`, `effective_date` and `guidance` (a paraphrase the model reads but no finding cites); see `ClauseItemDto`. A version can be marked reviewed only when every clause has a source URL, an effective date and an article or section. `rolled_back_from_version` is nullable; when set, this row was created as a rollback copy of that semantic version string (audit).

Similar structure to `template_versions` for versioning, but clauses are authoritative content.

A version is created inactive (migration 040) and becomes the ruleset's active one only through `POST /rulesets/:key/versions/:version/activate`, which requires:

| Column | Meaning |
|---|---|
| `ingestion_status` | `pending` until worker-ingestion stores its chunks (`ingested`, with `chunk_count`, `ingested_at`) or gives up (`failed`, with `ingestion_error`). Only an ingested version can be activated; a failed re-ingestion of an ingested version keeps it ingested (the chunk replace is atomic) and records the error. |
| `review_status` | `draft` until a platform admin records the legal review (`reviewed_by`, `reviewed_at` DATE, `review_notes`; a CHECK requires both when reviewed). Where `RULESETS_REQUIRE_REVIEW` is on (always in production, D-9), only a reviewed version can be activated; a result made with a draft carries the warning `rules_not_reviewed`. |

`rulesets.current_version` is NULL until the first version is activated. Analyses use a ruleset only when its active version is ingested.

---

## Tenant-Scoped Tables

These tables have **Row-Level Security (RLS) enabled** for tenant isolation.

### documents

Tenant-specific documents. Supports both text-input (pasted content) and file-upload (S3-stored) documents.

| Column              | Type                              | Description                                                                               |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `id`                | UUID                              | Primary key                                                                               |
| `tenant_id`         | UUID                              | **RLS isolation key** (FK to tenants)                                                     |
| `title`             | VARCHAR(255)                      | Document title                                                                            |
| `content`           | TEXT                              | Document content (required for text-input; populated after extraction for file-upload)    |
| `metadata`          | JSONB                             | Tags, custom fields, etc.                                                                 |
| `created_by`        | UUID                              | FK to users                                                                               |
| `created_at`        | TIMESTAMPTZ                       | Creation timestamp                                                                        |
| `updated_at`        | TIMESTAMPTZ                       | Last update timestamp                                                                     |
| `source_type`       | `document_source_type` ENUM       | `text_input` (default) or `file_upload`                                                   |
| `s3_key`            | VARCHAR(1024)                     | Full S3 object key (includes tenant prefix). NULL for text-input                          |
| `s3_bucket`         | VARCHAR(255)                      | Bucket name (`quarantine` or `clean`). NULL for text-input                                |
| `original_filename` | VARCHAR(512)                      | User's original filename for display/download                                             |
| `file_size_bytes`   | BIGINT                            | File size for validation and display                                                      |
| `mime_type`         | VARCHAR(255)                      | MIME type (e.g. `application/pdf`)                                                        |
| `extraction_status` | `document_extraction_status` ENUM | Extraction lifecycle: `pending`, `processing`, `completed`, `failed`. NULL for text-input |
| `extraction_error`  | TEXT                              | Error message if extraction failed                                                        |
| `extracted_at`      | TIMESTAMPTZ                       | When text extraction completed                                                            |
| `ocr_operation_id`  | TEXT                              | Document Intelligence analysis (result ID) of the scanned pages; ingestion retries resume it instead of starting another (migration 036; was `textract_job_id`) |
| `ocr_pages`         | INTEGER[]                         | Pages (1-based) whose text came from OCR (scans); `{}` = read from the PDF's text layer only; NULL = not extracted yet, or before migration 034 |

**Enums:**

- `document_source_type`: `text_input`, `file_upload`
- `document_extraction_status`: `pending`, `processing`, `completed`, `failed`

**Check Constraint:**

- `chk_document_source`: text-input docs must have `content`; file-upload docs must have `s3_key`

**Critical Indexes:**

- `idx_documents_tenant_id` - **Required for RLS performance**
- `idx_documents_extraction_status` - Partial index (WHERE extraction_status IS NOT NULL)
- `idx_documents_s3_key` - Partial index (WHERE s3_key IS NOT NULL)

**RLS Policies:**

```sql
-- SELECT Policy
CREATE POLICY documents_select ON documents
FOR SELECT USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- INSERT Policy
CREATE POLICY documents_insert ON documents
FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- UPDATE Policy
CREATE POLICY documents_update ON documents
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin())
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());
```

**What this means:**

- Users can only see/create/update documents for their current tenant
- Platform admins can read and update any document via `transactionWithPlatformAdminContext` (API only)
- Workers run each job in `transactionWithTenantContext({ tenantId })` with the tenant from the job
  payload, so a job naming a document of another tenant finds nothing and fails. They cross-check
  the payload against the row (job's document, file bucket and key, generation template) and act
  on the row's values. No worker uses platform-admin context (a unit test in `libs/database`
  enforces this); global tables (templates, rulesets) have no RLS
- No cross-tenant data access is possible for regular users

---

## Row-Level Security (RLS)

### How RLS Works

1. **Application uses transaction with tenant context:**

   ```typescript
   await databaseService.transactionWithTenantContext(
     { tenantId },
     async (client) => {
       // app.tenant_id is set automatically (transaction-scoped)
       return client.query('SELECT * FROM documents');
     },
   );
   ```

2. **PostgreSQL applies policies automatically:**

   ```sql
   -- User executes within transaction:
   SELECT * FROM documents;

   -- PostgreSQL applies RLS policy:
   -- WHERE tenant_id = current_tenant_id_or_null()
   -- Only rows matching the session's app.tenant_id are returned
   ```

3. **Result:** Users only see their tenant's data

### Session Context Functions

Helper functions for RLS policies (defined in migration 003; since migration 030 they are
`LANGUAGE sql STABLE` without exception blocks, so the planner inlines them instead of running
plpgsql per row. A malformed `app.tenant_id` reads as NULL, and a flag counts only when it is
exactly `'true'`):

```sql
-- Get current tenant ID (strict — throws if not set)
CREATE FUNCTION current_tenant_id() RETURNS UUID;

-- Get current tenant ID (permissive — returns NULL if not set, used in RLS policies)
CREATE FUNCTION current_tenant_id_or_null() RETURNS UUID;

-- Check if current operation is an auth flow (signup, login, etc.)
CREATE FUNCTION is_auth_flow() RETURNS BOOLEAN;
-- Reads: app.is_auth_flow

-- Check if current user has platform admin role
CREATE FUNCTION is_platform_admin() RETURNS BOOLEAN;
-- Reads: app.platform_role

-- Check if cross-tenant read is allowed (slug uniqueness checks)
CREATE FUNCTION allow_cross_tenant_read() RETURNS BOOLEAN;
-- Reads: app.allow_cross_tenant_read
```

### Verifying RLS

To verify tenant isolation:

```sql
-- Connect as app user
\c complytude complytude_app

-- Start a transaction and set context for Tenant 1
BEGIN;
SELECT set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', true);

-- Query documents (should only see Tenant 1's documents)
SELECT * FROM documents;
COMMIT;

-- Start a new transaction for Tenant 2
BEGIN;
SELECT set_config('app.tenant_id', '22222222-2222-4222-8222-222222222222', true);

-- Query again (should see different documents)
SELECT * FROM documents;
COMMIT;
```

**Important:** Always use `true` for the `is_local` parameter to scope settings to the transaction. Using `false` leaks the setting to the session, which would cause cross-tenant data leakage with connection pooling.

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
| 013 | `vector_tables.sql`                         | Vector/embedding tables (pgvector)                          |
| 014 | `vector_tables_grants.sql`                  | Grants for vector tables                                    |
| 015 | `vector_tables_rls_enablement.sql`          | RLS on vector tables                                        |
| 016 | `vector_tables_rls_policies.sql`            | RLS policies for vector tables                              |

### Running Migrations

```bash
# Run all migrations
pnpm db:migrate

# Or use the script directly
./scripts/run-migrations.sh
```

### Deletion and retention

- **Deleting a document** (`DELETE /documents/:id`) is a soft delete that erases content at once:
  `content`, `content_structured` and `generation_variables` are cleared, and so are the
  document's `analysis_jobs.result` and `generation_jobs.variables`. The row stays (who deleted it,
  when) and is hidden from the API, counts and both workers.
- **Daily retention sweep** (`data-retention-sweep` job, 03:15 UTC): deletes email-verification and
  password-reset tokens expired over 7 days (`cleanup_expired_tokens()`), marks expired invitations
  (`mark_expired_invitations()`), and removes uploads never confirmed within 2 days.
- **S3:** quarantine objects expire after 2 days, `previews/` after 1 day, previous versions after 30.
- **Not yet decided:** how long deleted documents, audit rows and Stripe payloads are kept before a
  hard delete, and tenant/user offboarding. These wait on a retention policy.

### Migration Tracking

Executed migrations are tracked in `public.schema_migrations`, with each file's SHA-256:

```sql
SELECT migration_name, checksum, executed_at
FROM schema_migrations
ORDER BY executed_at DESC;
```

The runner (`scripts/migrate.ts`) refuses to run if an applied file's checksum changed, applies
each file and its row in one transaction, and holds an advisory lock so two runners never apply the
same file. `run-migrations.sh --check` verifies the checksums without applying anything.

### Creating New Migrations

Migrations are append-only: never edit, rename or delete an existing file (CI fails a PR that does).

1. Create file: `scripts/migrations/NNN_description.sql` with the next number
2. Follow naming convention: `0XX_description.sql`
3. Exactly one `BEGIN;` and one `COMMIT;` around the statements (the runner adds its bookkeeping inside that transaction)
4. Prefer backward-compatible, idempotent changes (`IF NOT EXISTS`)
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

**Last Updated:** March 25, 2026

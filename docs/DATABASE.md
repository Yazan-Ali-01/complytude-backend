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
| Total Tables         | 16    |
| Core Tables          | 3     |
| Auth Tables          | 4     |
| Global Tables        | 6     |
| Tenant-Scoped Tables | 1     |
| Junction Tables      | 2     |
| Enums                | 5     |

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
SELECT set_config('app.tenant_id', 'tenant-uuid', false);
SELECT set_config('app.user_id', 'user-uuid', false);
SELECT set_config('app.role', 'admin', false);
```

RLS policies use these to filter data automatically.

---

## Table Groups

### 1. Core Multi-Tenancy

Tables that define the multi-tenant structure:

- `tenants` - Organizations using the platform
- `users` - User accounts (can belong to multiple tenants)
- `user_tenants` - Many-to-many relationship with roles

### 2. Authentication

Tables for JWT-based authentication and user onboarding:

- `refresh_tokens` - Session management (stores refresh tokens)
- `email_verifications` - Email verification flow
- `password_resets` - Password reset flow
- `invitations` - Tenant invitation management

**Note:** The application uses a **multi-step authentication flow**:

1. Login → `tempAuthToken` cookie (10 minutes, for tenant selection)
2. Tenant selection → `accessToken` + `refreshToken` cookies (full authentication)
3. Refresh tokens are stored in the `refresh_tokens` table for session management

### 3. Global Reference Data

Shared tables (no RLS):

- `authorities` - UAE legal authorities (DMCC, IFZA, etc.)
- `categories` - Template categories
- `rulesets` - Legal ruleset definitions
- `ruleset_versions` - Ruleset version history
- `templates` - Template metadata
- `template_versions` - Template version history

### 4. Junction Tables

Many-to-many relationships:

- `template_rulesets` - Templates ↔ Rulesets
- `template_version_ruleset_versions` - Version-level associations

### 5. Tenant-Scoped Data (RLS)

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

| Column            | Type         | Description                          |
| ----------------- | ------------ | ------------------------------------ |
| `id`              | UUID         | Primary key                          |
| `email`           | VARCHAR(255) | Unique email address                 |
| `password_hash`   | VARCHAR(255) | Bcrypt hashed password               |
| `first_name`      | VARCHAR(255) | First name                           |
| `last_name`       | VARCHAR(255) | Last name                            |
| `is_verified`     | BOOLEAN      | Email verification status            |
| `is_system_admin` | BOOLEAN      | Platform admin (not tenant-specific) |
| `created_at`      | TIMESTAMPTZ  | Creation timestamp                   |
| `updated_at`      | TIMESTAMPTZ  | Last update timestamp                |

**Indexes:**

- Unique constraint on `email` (creates implicit index)

### user_tenants

Many-to-many relationship: users belong to tenants with roles.

| Column       | Type        | Description                       |
| ------------ | ----------- | --------------------------------- |
| `user_id`    | UUID        | FK to users                       |
| `tenant_id`  | UUID        | FK to tenants                     |
| `role`       | ENUM        | Role: `admin`, `member`, `viewer` |
| `is_active`  | BOOLEAN     | Active membership flag            |
| `joined_at`  | TIMESTAMPTZ | When user joined tenant           |
| `updated_at` | TIMESTAMPTZ | Last update timestamp             |

**Primary Key:** `(user_id, tenant_id)`

**Indexes:**

- `idx_user_tenants_user_id`
- `idx_user_tenants_tenant_id`
- `idx_user_tenants_tenant_active` - Optimizes RLS queries

---

## Authentication Tables

### refresh_tokens

JWT refresh tokens for session management.

| Column       | Type         | Description                          |
| ------------ | ------------ | ------------------------------------ |
| `id`         | UUID         | Primary key                          |
| `user_id`    | UUID         | FK to users                          |
| `token_hash` | VARCHAR(255) | Hashed refresh token                 |
| `expires_at` | TIMESTAMPTZ  | Token expiration                     |
| `created_at` | TIMESTAMPTZ  | Creation timestamp                   |
| `revoked_at` | TIMESTAMPTZ  | Revocation timestamp (NULL if valid) |

**Indexes:**

- `idx_refresh_tokens_user_id`
- `idx_refresh_tokens_token_hash`
- `idx_refresh_tokens_expires_at`

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
| `role`        | ENUM         | Role to assign: `admin`, `member`, `viewer` (default: `member`) |
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

### Testing RLS

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

| #   | File                           | Description                                  |
| --- | ------------------------------ | -------------------------------------------- |
| 001 | `core_tables.sql`              | Tenants, users, user_tenants, auth tables    |
| 002 | `grants_to_app_user.sql`       | Grant permissions to app user                |
| 003 | `session_context_contract.sql` | RLS helper functions                         |
| 004 | `rls_enablement.sql`           | Enable RLS on tables                         |
| 005 | `rls_policies_core.sql`        | Create RLS policies                          |
| 006 | `global_tables.sql`            | Authorities, categories, templates, rulesets |
| 007 | `documents_table.sql`          | Documents table with RLS                     |
| 008 | `grants_global_tables.sql`     | Permissions for global tables                |

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

**Last Updated:** January 20, 2026

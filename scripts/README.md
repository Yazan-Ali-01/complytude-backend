# Scripts Directory

This directory contains database migrations, seeding, and utility scripts for Complytude.

> **Migrations are append-only:** never edit an applied migration; add a new numbered file. See [Creating Migrations](#creating-migrations) below.

## 🚀 Quick Start

**New to the project? Start here:**

```bash
# Complete setup: migrations + seeds
./scripts/setup-database.sh development
```

See **[QUICK_START.md](./QUICK_START.md)** for detailed instructions and troubleshooting.

---

## 📁 Directory Structure

```
scripts/
├── migrations/              # Database schema migrations (run in order)
│   ├── 001_core_tables.sql
│   ├── 002_grants_to_app_user.sql
│   ├── 003_session_context_contract.sql
│   ├── 004_rls_enablement.sql
│   ├── 005_rls_policies_core.sql
│   ├── 006_global_tables.sql
│   ├── 007_documents_table.sql
│   └── 008_grants_global_tables.sql
│
├── seeds/                   # Database seed data
│   ├── 001_seed_authorities.sql
│   ├── 002_seed_categories.sql
│   ├── 004_seed_test_tenants_users.sql
│   ├── 005_seed_templates.sql
│   ├── 006_seed_test_documents.sql
│   └── README.md
│   # Note: RBAC is auto-synced by TenantRbacSyncService on app startup
│
├── utilities/               # Management scripts
│
├── setup-database.sh        # 🔥 Complete setup (migrations + seeds)
├── run-migrations.sh        # Run all migrations
├── run-seeds.sh             # Run all seed scripts
├── download-geolite2-city.sh # Download MaxMind GeoLite2-City (session geo)
├── docker-start.sh          # Start Docker PostgreSQL
├── wait-for-db.sh           # Wait for database readiness
├── setup-roles.sh           # Create database roles
└── QUICK_START.md           # 📖 Comprehensive guide
```

---

## 🎯 Main Scripts

### 1. Complete Database Setup (Recommended)

**File:** `setup-database.sh`

Sets up everything in one command:

```bash
# Development (full sample data)
./scripts/setup-database.sh development

# Staging (limited sample data)
./scripts/setup-database.sh staging

# Production (reference data only)
./scripts/setup-database.sh production

# Migrations only, skip seeds
./scripts/setup-database.sh development --skip-seeds
```

**What it does:**

1. ✅ Runs all 8 migrations (schema, RLS, grants)
2. ✅ Seeds authorities and categories
3. ✅ Seeds sample data (dev only)
4. ✅ Provides summary and next steps

### 2. Run Migrations Only

**File:** `run-migrations.sh`

Runs database migrations:

```bash
./scripts/run-migrations.sh
```

**Features:**

- Creates database if it doesn't exist
- Tracks which migrations have run
- Skips already-executed migrations
- Stops on first error
- Shows detailed progress

### 3. Run Seeds Only

**File:** `run-seeds.sh`

Populates database with initial data:

```bash
# Development: reference data + test fixtures
./scripts/run-seeds.sh development

# Staging / production: reference data only (authorities, categories)
./scripts/run-seeds.sh staging
./scripts/run-seeds.sh production

# Print the plan without touching the database
./scripts/run-seeds.sh staging --list
```

**Seeds:**

- Everywhere: 10 UAE authorities (DMCC, DIFC, etc.) and template categories
- Development/test only: 3 test tenants and 7 test users with a published password (including a `system_admin`), sample templates, documents, subscriptions, entitlements and demo rulesets

Test fixtures load only when the environment argument is `development`/`test` **and** `NODE_ENV` is unset or `development`/`test`; `003_seed_test_tenants_users.sql` also refuses to run outside `run-seeds.sh`. See [seeds/README.md](./seeds/README.md).

**Note:** RBAC roles and permissions are auto-synced by `TenantRbacSyncService` on app startup, and features/plans by `EntitlementSyncService`. Platform admins are created with `pnpm admin:grant <email>`.

### 4. Download GeoLite2-City (Optional — Session Geo Enrichment)

**File:** `download-geolite2-city.sh`

Downloads the MaxMind GeoLite2-City database for IP-to-location lookup during login. Session `geoLocation` is populated asynchronously when the database is present.

**Prerequisites:**

1. [MaxMind account](https://www.maxmind.com/en/geolite2/signup) (free)
2. [License key](https://www.maxmind.com/en/accounts/current/license-key)

**Usage:**

```bash
MAXMIND_LICENSE_KEY=your_key ./scripts/download-geolite2-city.sh
```

**Output:** `./data/GeoLite2-City.mmdb` (or `MAXMIND_DB_PATH` if set)

**Configuration:** Add to `.env`:

```
MAXMIND_DB_PATH=./data/GeoLite2-City.mmdb
```

If `MAXMIND_DB_PATH` is empty or the file does not exist, geo lookup is disabled and sessions will have `geoLocation: null`.

---

## 📋 Migrations

### Available Migrations

| #   | File                           | Description                                               |
| --- | ------------------------------ | --------------------------------------------------------- |
| 001 | `core_tables.sql`              | Core schema: tenants, users, user_tenants, auth artifacts |
| 002 | `grants_to_app_user.sql`       | Grant permissions to `complytude_app` user                |
| 003 | `session_context_contract.sql` | Session variables for RLS (tenant_id, user_id, role)      |
| 004 | `rls_enablement.sql`           | Enable RLS on tenant-specific tables                      |
| 005 | `rls_policies_core.sql`        | RLS policies for multi-tenancy                            |
| 006 | `global_tables.sql`            | Authorities, categories, templates, rulesets              |
| 007 | `documents_table.sql`          | Documents table with tenant isolation                     |
| 008 | `grants_global_tables.sql`     | Permissions for global tables                             |

### Migration Tracking

Migrations are tracked in `public.schema_migrations`:

```sql
SELECT migration_name, executed_at
FROM public.schema_migrations
ORDER BY executed_at DESC;
```

### Creating Migrations

Every schema change is a **new** file; never edit, rename or delete an existing one. The runner
(`scripts/migrate.ts`, called by `run-migrations.sh` and `pnpm db:migrate`) stores each applied
file's SHA-256 and refuses to run if one changed, and CI fails a PR that modifies an existing file.

**Steps:**

1. Create `scripts/migrations/NNN_description.sql` with the next number
2. Include the header with a description, one `BEGIN;` / `COMMIT;` pair, and a commented rollback block
3. Prefer backward-compatible changes (the previous release still runs while it applies)
4. Run `pnpm db:migrate` (or `./scripts/run-migrations.sh`); `--check` only verifies checksums

The runner applies each file and its `schema_migrations` row in one transaction under an advisory
lock, so a failed or interrupted migration leaves nothing half-recorded.

**Template:**

```sql
-- =========================
-- Migration 009: Description
-- =========================
-- Description: What this does
-- Dependencies: 001-008
-- =========================

BEGIN;

-- Your SQL here
CREATE TABLE IF NOT EXISTS ...

COMMIT;
```

---

## 🌱 Seeds

### Available Seed Scripts

| #   | File                          | Description                        | Environment |
| --- | ----------------------------- | ---------------------------------- | ----------- |
| 001 | `seed_authorities.sql`        | UAE authorities (DMCC, DIFC, etc.) | All         |
| 002 | `seed_categories.sql`         | Template categories                | All         |
| 004 | `seed_test_tenants_users.sql` | Sample tenants and users           | Dev/Staging |
| 005 | `seed_templates.sql`          | Sample templates                   | Dev/Staging |
| 006 | `seed_test_documents.sql`     | Tenant-specific documents          | Dev/Staging |

**Note:** RBAC roles and permissions are automatically synced from code constants by `TenantRbacSyncService` on every application startup. No SQL seed script is needed.

### Development Credentials

After seeding development data:

**Email:** `admin@tenant1.test`
**Password:** `Test123!@#`

See `scripts/seeds/README.md` for complete credential list.

### Verifying RLS Isolation

```sql
-- Connect as app user
\c complytude complytude_app

-- Set context for Tenant 1
SELECT set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('app.user_id', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', false);
SELECT set_config('app.role', 'admin', false);

-- Should return 3 documents for Tenant 1
SELECT * FROM public.documents;

-- Change to Tenant 2
SELECT set_config('app.tenant_id', '22222222-2222-4222-8222-222222222222', false);

-- Should return 2 DIFFERENT documents
SELECT * FROM public.documents;
```

---

## 🛠️ Utility Scripts

### Docker Management

```bash
# Start infrastructure services (PostgreSQL, Redis, etc.)
pnpm services:up

# Stop services
pnpm services:down

# Reset database (⚠️ deletes all data)
pnpm services:reset
```

### Role Setup

```bash
./scripts/setup-roles.sh
```

Creates database roles:

- `complytude_admin` - Full access
- `complytude_app` - Application user with RLS

### Wait for Database

```bash
./scripts/wait-for-db.sh
```

Waits for PostgreSQL to be ready (useful in CI/CD).

---

## 📊 Database Management

### Check Database Status

```bash
# View tables
psql -d complytude -c "\dt"

# Count records
psql -d complytude -c "
  SELECT 'Tenants' as table_name, COUNT(*) as count FROM public.tenants
  UNION ALL
  SELECT 'Users', COUNT(*) FROM public.users
  UNION ALL
  SELECT 'Templates', COUNT(*) FROM public.templates
  UNION ALL
  SELECT 'Documents', COUNT(*) FROM public.documents;
"

# Check RLS policies
psql -d complytude -c "\d+ documents"
```

### Verify RLS is Enabled

```sql
SELECT
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = true;
```

### View User-Tenant Relationships

```sql
SELECT
    u.email,
    t.plan,
    ut.role
FROM public.user_tenants ut
JOIN public.users u ON ut.user_id = u.id
JOIN public.tenants t ON ut.tenant_id = t.id
ORDER BY t.plan, u.email;
```

---

## 🔧 Troubleshooting

### "psql: command not found"

Install PostgreSQL client:

```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt install postgresql-client

# Windows
# Download from: https://www.postgresql.org/download/windows/
```

### "Cannot connect to database"

1. Check Docker is running:

   ```bash
   docker ps
   ```

2. Start database:

   ```bash
   pnpm services:up
   ```

3. Wait for readiness:

   ```bash
   ./scripts/wait-for-db.sh
   ```

4. Verify connection:
   ```bash
   psql -d complytude -c "SELECT 1;"
   ```

### "Permission denied: ./scripts/..."

Make scripts executable:

```bash
chmod +x scripts/*.sh
```

### Migration Fails

1. Check error message
2. Fix migration file
3. Reset the DB and re-run all migrations:
   ```bash
   docker-compose down -v
   docker-compose up -d postgres
   ./scripts/run-migrations.sh
   ```

### No Sample Data Showing

Make sure you ran seeds for development:

```bash
./scripts/run-seeds.sh development
```

Production environment only seeds reference data, not sample data.

### RLS Not Working

1. Verify RLS is enabled:

   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public';
   ```

2. Check policies exist:

   ```sql
   SELECT * FROM pg_policies WHERE schemaname = 'public';
   ```

3. Verify session context is set:
   ```sql
   SELECT current_setting('app.tenant_id', true);
   SELECT current_setting('app.user_id', true);
   SELECT current_setting('app.role', true);
   ```

---

## 📝 Best Practices

### Migrations

✅ **DO:**

- Always make migrations idempotent
- Use sequential numbering (001, 002, 003...)
- Include clear descriptions
- Test on clean database before committing
- Use transactions (BEGIN/COMMIT)

❌ **DON'T:**

- Skip numbers in sequence
- Use production data in migrations
- Forget to grant permissions to app user

**Note:** Migrations are immutable: never edit an applied one, only add new files.

### Seeds

✅ **DO:**

- Use `ON CONFLICT DO NOTHING` for idempotency
- Include verification queries
- Use realistic sample data
- Document development credentials

❌ **DON'T:**

- Use real user passwords in seeds
- Seed sample data in production
- Hardcode production values

### RLS Verification

✅ **DO:**

- Verify tenant isolation thoroughly
- Verify cross-tenant queries return nothing
- Verify different user roles
- Use session context properly

❌ **DON'T:**

- Bypass RLS in application code
- Assume RLS works without verification
- Use superuser role in production

---

## 🎯 Common Tasks

### New Developer Onboarding

```bash
# 1. Clone repository
git clone <repo-url>

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your settings

# 4. Start database
pnpm services:up

# 5. Setup database
./scripts/setup-database.sh development

# 6. Start application
pnpm start:dev

# 7. Access Swagger docs
open http://localhost:3000/docs
```

### Reset Database Completely

⚠️ **Warning: Deletes all data**

```bash
# Wipe volumes, restart services, and re-migrate
pnpm services:reset
```

### Add New Authority

```sql
INSERT INTO public.authorities (code, name, description, country, is_active)
VALUES ('NEW_AUTH', 'New Authority Name', 'Description here', 'UAE', true)
ON CONFLICT (code) DO NOTHING;
```

### Add New Template Category

```sql
INSERT INTO public.categories (code, name, description, parent_id, is_active)
VALUES ('new_category', 'New Category', 'Description here', NULL, true)
ON CONFLICT (code) DO NOTHING;
```

### Create Sample Tenant Manually

```sql
-- Create tenant (Note: plan column is deprecated, use tenant_subscriptions instead)
INSERT INTO public.tenants (id, is_active, name, slug)
VALUES (gen_random_uuid(), true, 'Sample Tenant', 'sample-tenant')
RETURNING id;

-- Create subscription for tenant
INSERT INTO public.tenant_subscriptions (
    tenant_id, plan_id, status,
    current_period_start, current_period_end,
    billing_period_start, billing_period_end
)
SELECT
    'tenant-id-here',  -- Replace with actual tenant ID from above
    p.id,
    'active',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW(),
    NOW() + INTERVAL '30 days'
FROM public.plans p
WHERE p.key = 'navigator';  -- Choose desired plan

-- Create user (use the returned tenant ID)
INSERT INTO public.users (email, password_hash, first_name, last_name, is_verified)
VALUES ('sample@example.com', '$2b$10$hash...', 'Sample', 'User', true)
RETURNING id;

-- Link user to tenant (use both returned IDs)
INSERT INTO public.user_tenants (user_id, tenant_id, role_key)
VALUES ('user-id', 'tenant-id', 'tenant_admin');
```

---

## 📚 Related Documentation

- **[QUICK_START.md](./QUICK_START.md)** - Comprehensive setup guide
- **[seeds/README.md](./seeds/README.md)** - Seed scripts documentation
- **[../PLAN_FEATURES_GUIDE.md](../PLAN_FEATURES_GUIDE.md)** - Plan-based features
- **[../MULTI_TENANCY.md](../MULTI_TENANCY.md)** - Multi-tenancy overview
- **[../AUTH_GUIDE.md](../AUTH_GUIDE.md)** - Authentication guide

---

## 🆘 Need Help?

1. Read [QUICK_START.md](./QUICK_START.md)
2. Check error messages carefully
3. Verify services are running: `pnpm services:up`
4. Verify `.env` configuration
5. Test connection: `psql -d complytude -c "SELECT 1;"`
6. Check migration status: `SELECT * FROM schema_migrations;`

**Still stuck?**

- Ensure Docker is running
- Verify database credentials
- Check user permissions: `\du` in psql
- Try resetting database

---

## 📊 Statistics

After full setup (development):

| Entity      | Count |
| ----------- | ----- |
| Migrations  | 8     |
| Tenants     | 3     |
| Users       | 7     |
| Authorities | 10    |
| Categories  | 10    |
| Templates   | 5     |
| Documents   | 7     |

**Database size:** ~2-5 MB with sample data

---

**Happy coding! 🚀**

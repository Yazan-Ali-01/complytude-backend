# Scripts Directory

This directory contains database migrations, seeding, and utility scripts for Complytude.

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
│   # Note: RBAC is auto-synced by RbacSyncService on app startup
│
├── utilities/               # Management and testing scripts
│   └── manage-custom-features.sql
│
├── setup-database.sh        # 🔥 Complete setup (migrations + seeds)
├── run-migrations.sh        # Run all migrations
├── run-seeds.sh             # Run all seed scripts
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
# Development (full test data)
./scripts/setup-database.sh development

# Staging (limited test data)
./scripts/setup-database.sh staging

# Production (reference data only)
./scripts/setup-database.sh production

# Migrations only, skip seeds
./scripts/setup-database.sh development --skip-seeds
```

**What it does:**

1. ✅ Runs all 8 migrations (schema, RLS, grants)
2. ✅ Seeds authorities and categories
3. ✅ Seeds test data (dev only)
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
# Development environment
./scripts/run-seeds.sh development

# Staging environment
./scripts/run-seeds.sh staging

# Production (reference data only)
./scripts/run-seeds.sh production
```

**Seeds:**

- 10 UAE authorities (DMCC, DIFC, etc.)
- 10 template categories
- 3 test tenants (dev/staging)
- 7 test users (dev/staging)
- 5 sample templates (dev/staging)
- 7 sample documents (dev/staging)

**Note:** RBAC roles and permissions are auto-synced by `RbacSyncService` on app startup.

---

## 📋 Migrations

### Available Migrations

| #   | File                           | Description                                               |
| --- | ------------------------------ | --------------------------------------------------------- |
| 001 | `core_tables.sql`              | Core schema: tenants, users, user_tenants, refresh_tokens |
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

### Creating New Migrations

1. Create file: `scripts/migrations/009_description.sql`
2. Use next sequential number
3. Include header with description
4. Make it idempotent
5. Run `./scripts/run-migrations.sh`

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
| 004 | `seed_test_tenants_users.sql` | Test tenants and users             | Dev/Staging |
| 005 | `seed_templates.sql`          | Sample templates                   | Dev/Staging |
| 006 | `seed_test_documents.sql`     | Tenant-specific documents          | Dev/Staging |

**Note:** RBAC roles and permissions are automatically synced from code constants by `RbacSyncService` on every application startup. No SQL seed script is needed.

### Test Credentials

After seeding development data:

**Email:** `admin@tenant1.test`  
**Password:** `Test123!@#`

See `scripts/seeds/README.md` for complete credential list.

### Testing RLS Isolation

```sql
-- Connect as app user
\c complytude complytude_app

-- Set context for Tenant 1
SELECT set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('app.user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
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
# Start PostgreSQL
npm run docker:start
# or
./scripts/docker-start.sh

# Stop PostgreSQL
npm run docker:stop

# View logs
npm run docker:logs

# Reset database (⚠️ deletes all data)
npm run docker:reset
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

### Custom Features Management

**File:** `utilities/manage-custom-features.sql`

Manage tenant features:

```sql
-- View tenant features
SELECT id, plan, features FROM public.tenants;

-- Grant custom feature
UPDATE public.tenants
SET features = jsonb_set(features, '{custom_feature}', 'true')
WHERE id = 'tenant-id';
```

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
   npm run docker:start
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
3. Remove from tracking if needed:
   ```sql
   DELETE FROM public.schema_migrations
   WHERE migration_name = 'failed_migration.sql';
   ```
4. Re-run: `./scripts/run-migrations.sh`

### No Test Data Showing

Make sure you ran seeds for development:

```bash
./scripts/run-seeds.sh development
```

Production environment only seeds reference data, not test data.

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

- Modify executed migrations (create new one instead)
- Skip numbers in sequence
- Use production data in migrations
- Forget to grant permissions to app user

### Seeds

✅ **DO:**

- Use `ON CONFLICT DO NOTHING` for idempotency
- Include verification queries
- Use realistic test data
- Document test credentials

❌ **DON'T:**

- Use real user passwords in seeds
- Seed test data in production
- Hardcode production values

### RLS Testing

✅ **DO:**

- Test tenant isolation thoroughly
- Verify cross-tenant queries return nothing
- Test different user roles
- Use session context properly

❌ **DON'T:**

- Bypass RLS in application code
- Assume RLS works without testing
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
npm run docker:start

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
# Stop and remove database
npm run docker:reset

# Start fresh database
npm run docker:start

# Run migrations and seeds
./scripts/setup-database.sh development
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

### Create Test Tenant Manually

```sql
-- Create tenant
INSERT INTO public.tenants (id, plan, features, is_active)
VALUES (gen_random_uuid(), 'pro', '{"api_access": true}'::jsonb, true)
RETURNING id;

-- Create user (use the returned tenant ID)
INSERT INTO public.users (email, password_hash, first_name, last_name, is_verified)
VALUES ('test@example.com', '$2b$10$hash...', 'Test', 'User', true)
RETURNING id;

-- Link user to tenant (use both returned IDs)
INSERT INTO public.user_tenants (user_id, tenant_id, role)
VALUES ('user-id', 'tenant-id', 'admin');
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
3. Review PostgreSQL logs: `npm run docker:logs`
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

**Database size:** ~2-5 MB with test data

---

**Happy coding! 🚀**

# Scripts Directory

This directory contains database migrations and utility scripts for Complytude.

## 📁 Directory Structure

```
scripts/
├── migrations/           # Database migration files (run in order)
│   ├── 001_init_multi_tenancy.sql
│   └── 002_init_auth.sql
├── utilities/           # Utility scripts for management and testing
│   ├── manage-custom-features.sql
│   ├── test-multi-tenancy.sql
│   └── verify-multi-tenancy.sql
├── docker-start.sh      # Start Docker PostgreSQL
└── run-migrations.sh    # Run all migrations
```

---

## 🚀 Quick Start

### 1. Start Database

```bash
npm run docker:start
# or
./scripts/docker-start.sh
```

### 2. Run Migrations

```bash
./scripts/run-migrations.sh
```

This will:
- Create the database if it doesn't exist
- Run all migrations in order
- Track which migrations have been executed
- Skip already-executed migrations

---

## 📋 Migrations

Migrations are numbered SQL files that run in sequential order. They are **idempotent** - safe to run multiple times.

### Available Migrations

| Migration | Description | Dependencies |
|-----------|-------------|--------------|
| `001_init_multi_tenancy.sql` | Multi-tenancy infrastructure with schema isolation and RLS | None |
| `002_init_auth.sql` | Authentication tables, user management, tokens | Migration 001 |

### Migration Tracking

Migrations are tracked in the `public.schema_migrations` table:

```sql
SELECT * FROM public.schema_migrations ORDER BY executed_at DESC;
```

### Creating a New Migration

1. Create a new file: `scripts/migrations/00X_description.sql`
2. Use the next sequential number
3. Include header comment with description and dependencies
4. Make it idempotent using `IF NOT EXISTS` clauses
5. Run `./scripts/run-migrations.sh` to apply

**Template:**

```sql
-- ============================================================================
-- Migration 003: Your Description
-- ============================================================================
-- Description: What this migration does
-- Dependencies: 001, 002
-- ============================================================================

-- Your SQL here
CREATE TABLE IF NOT EXISTS ...

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 003: Your description completed';
END $$;
```

---

## 🛠️ Utility Scripts

### Custom Feature Management

**File:** `utilities/manage-custom-features.sql`

Manage custom feature overrides for special customers:

```bash
# Connect to database
psql -U postgres -d complytude

# Copy and paste queries from the file
```

**Common operations:**
- View tenant features
- Grant custom features
- Remove custom features
- Bulk operations
- Reporting queries

See the file for complete examples.

### Multi-Tenancy Testing

**File:** `utilities/test-multi-tenancy.sql`

Test tenant isolation and RLS:

```bash
psql -U postgres -d complytude -f scripts/utilities/test-multi-tenancy.sql
```

**Tests:**
- Creates test tenants
- Creates sample data
- Tests RLS isolation
- Tests schema isolation
- Cleans up after itself

### Multi-Tenancy Verification

**File:** `utilities/verify-multi-tenancy.sql`

Verify multi-tenancy setup:

```bash
psql -U postgres -d complytude -f scripts/utilities/verify-multi-tenancy.sql
```

**Checks:**
- Tables exist
- RLS enabled
- Policies configured
- Indexes created
- Helper functions available
- Tenant statistics

---

## 🐳 Docker Scripts

### Docker Start

**File:** `docker-start.sh`

Starts PostgreSQL in Docker:

```bash
npm run docker:start
# or
./scripts/docker-start.sh
```

**Features:**
- Checks if Docker is running
- Creates/starts PostgreSQL container
- Waits for database to be ready
- Shows connection details

**Related commands:**
```bash
npm run docker:start   # Start database
npm run docker:stop    # Stop database
npm run docker:logs    # View logs
npm run docker:reset   # Reset database (⚠️ deletes all data)
```

---

## 📊 Database Management

### View Migration Status

```sql
-- See which migrations have run
SELECT 
    migration_name, 
    executed_at 
FROM public.schema_migrations 
ORDER BY executed_at DESC;
```

### Manual Migration Execution

If you need to run a specific migration:

```bash
psql -U postgres -d complytude -f scripts/migrations/001_init_multi_tenancy.sql
```

### Rollback Migrations

Migrations don't have automatic rollback. To rollback:

1. Manually write and execute DROP statements
2. Remove the entry from `schema_migrations`
3. Re-run migrations

**Example:**

```sql
-- Remove migration record
DELETE FROM public.schema_migrations WHERE migration_name = '002_init_auth.sql';

-- Drop created objects
DROP TABLE IF EXISTS public.users CASCADE;
-- ... more DROP statements ...

-- Re-run migration
-- Run: psql -f scripts/migrations/002_init_auth.sql
```

---

## 🔧 Troubleshooting

### Migration Fails

1. Check the error message
2. Fix the migration file
3. Remove from tracking if partially executed:
   ```sql
   DELETE FROM public.schema_migrations WHERE migration_name = 'xxx_failed.sql';
   ```
4. Re-run: `./scripts/run-migrations.sh`

### Database Connection Issues

```bash
# Check Docker is running
docker ps

# Check database is ready
docker exec complytude-postgres pg_isready

# View logs
npm run docker:logs

# Restart database
npm run docker:stop
npm run docker:start
```

### Reset Database

⚠️ **Warning: This deletes ALL data**

```bash
npm run docker:reset
./scripts/run-migrations.sh
```

---

## 📝 Best Practices

### Migrations

1. **Always idempotent** - Use `IF NOT EXISTS`, `IF EXISTS`
2. **Sequential numbering** - Use 001, 002, 003...
3. **Clear descriptions** - Document what and why
4. **Test before commit** - Run on clean database
5. **Never modify executed migrations** - Create new migration instead

### Custom Features

1. **Document changes** - Note why custom features were granted
2. **Test on one tenant first** - Before bulk operations
3. **Set updated_at** - Always update timestamp
4. **Use transactions** - For complex changes

### Utilities

1. **Run in non-production first** - Test scripts safely
2. **Backup before bulk operations** - Especially for DELETE/UPDATE
3. **Use RLS bypass carefully** - Only when needed

---

## 🎯 Common Tasks

### New Project Setup

```bash
# 1. Start database
npm run docker:start

# 2. Run migrations
./scripts/run-migrations.sh

# 3. Start app
npm run start:dev
```

### Add Custom Feature to Tenant

```bash
# Connect to database
psql -U postgres -d complytude

# Grant feature
UPDATE public.tenants 
SET features = '{"analyzer_enabled": true}'::jsonb
WHERE tenant_id = 'tenant_123';
```

### Check System Status

```bash
# Verify multi-tenancy setup
psql -U postgres -d complytude -f scripts/utilities/verify-multi-tenancy.sql

# Check migration status
psql -U postgres -d complytude -c "SELECT * FROM schema_migrations;"

# View tenant stats
psql -U postgres -d complytude -c "SELECT plan, COUNT(*) FROM tenants GROUP BY plan;"
```

---

## 📚 Related Documentation

- [PLAN_FEATURES_GUIDE.md](../PLAN_FEATURES_GUIDE.md) - Plan-based features
- [MULTI_TENANCY.md](../MULTI_TENANCY.md) - Multi-tenancy overview
- [AUTH_GUIDE.md](../AUTH_GUIDE.md) - Authentication guide
- [DOCKER.md](../DOCKER.md) - Docker setup

---

## 🆘 Need Help?

- Check the error message carefully
- Review related documentation
- Check Docker and PostgreSQL are running
- Verify .env configuration
- Check migration tracking table

**Connection Issues?**
```bash
# Test connection
psql -U postgres -h localhost -p 5432 -d complytude -c "SELECT 1;"
```

**Migration Issues?**
```bash
# Check what's been run
psql -U postgres -d complytude -c "SELECT * FROM schema_migrations;"
```


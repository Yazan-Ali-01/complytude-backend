# Quick Start Guide - Database Setup & Seeding

This guide will help you set up and seed your Complytude database with test data.

## Prerequisites

- PostgreSQL 15+ running (via Docker or local installation)
- Database credentials configured in `.env` file
- `psql` command-line tool installed

## Option 1: Complete Setup (Recommended) 🚀

Run everything in one command:

```bash
# For development with full test data
./scripts/setup-database.sh development

# For staging (limited test data)
./scripts/setup-database.sh staging

# For production (only reference data)
./scripts/setup-database.sh production

# Run only migrations, skip seeds
./scripts/setup-database.sh development --skip-seeds
```

This will:

1. ✅ Run all 8 migrations (create schema, enable RLS, set up policies)
2. ✅ Seed authorities and categories (reference data)
3. ✅ Seed test tenants, users, templates, and documents (dev only)

## Option 2: Step-by-Step Setup

### Step 1: Run Migrations

```bash
./scripts/run-migrations.sh
```

This creates your database schema with:

- Core tables (tenants, users, user_tenants, email verifications, etc.)
- Global tables (authorities, categories, templates, etc.)
- RLS policies for tenant isolation
- Proper grants for `complytude_app` user

### Step 2: Seed Data

```bash
./scripts/run-seeds.sh development
```

This populates your database with:

- 10 UAE authorities (DMCC, DIFC, ADGM, etc.)
- 10 template categories
- 3 test tenants (Pro, Basic, Enterprise plans)
- 7 test users with various roles
- 5 sample templates
- 7 sample documents (tenant-specific)

## Test Credentials

After seeding, use these credentials to test your API:

| Tenant                | Email               | Password   | Role   |
| --------------------- | ------------------- | ---------- | ------ |
| Tenant 1 (Pro)        | admin@tenant1.test  | Test123!@# | admin  |
| Tenant 1 (Pro)        | member@tenant1.test | Test123!@# | member |
| Tenant 1 (Pro)        | viewer@tenant1.test | Test123!@# | viewer |
| Tenant 2 (Basic)      | admin@tenant2.test  | Test123!@# | admin  |
| Tenant 2 (Basic)      | member@tenant2.test | Test123!@# | member |
| Tenant 3 (Enterprise) | admin@tenant3.test  | Test123!@# | admin  |

## Verifying Your Setup

### 1. Check Database Connection

```bash
psql -d complytude -c "SELECT version();"
```

### 2. Verify Tables Created

```bash
psql -d complytude -c "\dt"
```

You should see tables like:

- tenants
- users
- user_tenants
- authorities
- categories
- templates
- template_versions
- documents

### 3. Check Seeded Data

```bash
psql -d complytude -c "
  SELECT 'Tenants' as table_name, COUNT(*) as count FROM public.tenants
  UNION ALL
  SELECT 'Users', COUNT(*) FROM public.users
  UNION ALL
  SELECT 'Templates', COUNT(*) FROM public.templates
  UNION ALL
  SELECT 'Documents', COUNT(*) FROM public.documents;
"
```

Expected counts (development):

- Tenants: 3
- Users: 7
- Templates: 5
- Documents: 7

### 4. Test RLS Tenant Isolation

```sql
-- Connect as app user
\c complytude complytude_app

-- Set context for Tenant 1
SELECT set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('app.user_id', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', false);
SELECT set_config('app.role', 'admin', false);

-- Should return 3 documents
SELECT id, name, status FROM public.documents;

-- Change to Tenant 2
SELECT set_config('app.tenant_id', '22222222-2222-4222-8222-222222222222', false);

-- Should return 2 DIFFERENT documents
SELECT id, name, status FROM public.documents;
```

✅ If Tenant 1 and Tenant 2 see different documents, **RLS is working correctly!**

## Testing Your NestJS API

### 1. Start Development Server

```bash
pnpm start:dev
```

### 2. Access Swagger Docs

Open: http://localhost:3000/docs

### 3. Test Authentication Endpoint

```bash
# Login as Tenant 1 admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tenant1.test",
    "password": "Test123!@#"
  }'
```

You should receive:

- `access_token` (JWT)
- `refresh_token`
- User information
- Tenant information

### 4. Test Tenant-Isolated Endpoints

```bash
# Use the access_token from login
export TOKEN="your_access_token_here"

# Get documents (should only see Tenant 1's 3 documents)
curl http://localhost:3000/api/documents \
  -H "Authorization: Bearer $TOKEN"

# Get templates (global - all tenants see the same 5 templates)
curl http://localhost:3000/api/templates \
  -H "Authorization: Bearer $TOKEN"
```

## Troubleshooting

### Issue: "psql: command not found"

**Solution**: Install PostgreSQL client tools

```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt install postgresql-client

# Windows
# Download from: https://www.postgresql.org/download/windows/
```

### Issue: "Cannot connect to database"

**Solution**: Check your `.env` file

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=complytude
DB_USER=complytude_app
DB_PASSWORD=your_password_here
```

Or if using Docker:

```bash
# Start PostgreSQL container
pnpm docker:start

# Wait for database to be ready
./scripts/wait-for-db.sh
```

### Issue: "Permission denied: ./scripts/run-migrations.sh"

**Solution**: Make scripts executable

```bash
chmod +x scripts/*.sh
```

### Issue: Migration fails with "role does not exist"

**Solution**: Create the app user first

```bash
./scripts/setup-roles.sh
```

Or manually:

```sql
CREATE ROLE complytude_app WITH LOGIN PASSWORD 'your_password';
GRANT CONNECT ON DATABASE complytude TO complytude_app;
```

### Issue: "No test data showing up"

**Solution**: Make sure you ran seeds for development

```bash
./scripts/run-seeds.sh development
```

Check the environment parameter - production only seeds reference data, not test data.

## Environment-Specific Behavior

### Development

- ✅ All reference data (authorities, categories)
- ✅ Test tenants and users
- ✅ Sample templates
- ✅ Test documents for RLS verification

### Staging

- ✅ Reference data
- ✅ Limited test data
- ⚠️ Consider using production-like data

### Production

- ✅ Reference data only (authorities, categories)
- ❌ NO test tenants/users
- ❌ NO test documents
- ⚠️ Requires manual confirmation before seeding

## Next Steps

1. ✅ **Verify RLS works** - Test tenant isolation via psql
2. ✅ **Test authentication** - Login with test credentials
3. ✅ **Create test endpoint** - Build a `/api/test/rls` endpoint to verify policies
4. ✅ **Verify multi-tenancy** - Ensure proper tenant isolation
5. ✅ **Document your API** - Update Swagger docs with examples

## Additional Resources

- [Migrations README](./migrations/README.md)
- [Seeds README](./seeds/README.md)
- [Database Schema](./migrations/001_core_tables.sql)
- [RLS Policies](./migrations/005_rls_policies_core.sql)

---

**Need Help?**

If you encounter issues:

1. Check PostgreSQL logs: `docker logs complytude-postgres`
2. Review migration output for errors
3. Verify `.env` configuration
4. Check user permissions: `\du` in psql
5. Test database connection: `psql -d complytude -c "SELECT 1;"`

Happy coding! 🚀

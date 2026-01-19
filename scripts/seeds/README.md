# Database Seed Scripts

This directory contains seed scripts for populating initial reference data in the database.

## Overview

Seed scripts are separate from migrations and should be run after the schema migrations are complete. They are idempotent (safe to run multiple times) using `ON CONFLICT DO NOTHING`.

## Available Seed Scripts

### 001_seed_authorities.sql
Seeds initial legal authorities for UAE:
- DMCC (Dubai Multi Commodities Centre)
- IFZA (International Free Zone Authority)
- DED (Department of Economic Development)
- RAKEZ (Ras Al Khaimah Economic Zone)
- ADGM (Abu Dhabi Global Market)
- DIFC (Dubai International Financial Centre)
- SHAMS (Sharjah Media City)
- DAFZA (Dubai Airport Free Zone Authority)
- JAFZA (Jebel Ali Free Zone)
- ADCCI (Abu Dhabi Chamber of Commerce and Industry)

### 002_seed_categories.sql
Seeds initial template categories:
- Employment Contracts
- Freelance Agreements
- Commercial Contracts
- Lease Agreements
- Service Agreements
- Non-Disclosure Agreements
- Partnership Agreements
- Corporate Documents
- Compliance Documents
- Intellectual Property

### 003_seed_test_tenants_users.sql
Seeds test tenants, users, and relationships for development/testing:
- **3 Test Tenants**: Pro, Basic, and Enterprise plans
- **7 Test Users**: Including admins, members, viewers, and a super admin
- **User-Tenant Relationships**: Various role assignments
- **Refresh Tokens**: For authentication testing
- **Test Credentials**: Email: `admin@tenant1.test`, Password: `Test123!@#`

⚠️ **WARNING**: Contains test data - DO NOT use in production!

### 004_seed_templates.sql
Seeds sample templates with versions:
- 5 complete templates across different authorities and categories
- Template versions with field definitions
- Demonstrates versioning (ADGM Partnership has v1.0.0 and v2.0.0)
- Includes realistic field schemas in JSONB format

### 005_seed_test_documents.sql
Seeds tenant-specific documents for RLS testing:
- **Tenant 1 (Pro)**: 3 documents
- **Tenant 2 (Basic)**: 2 documents
- **Tenant 3 (Enterprise)**: 2 documents
- Documents with various statuses: draft, pending_review, signed
- Perfect for testing tenant isolation and RLS policies

## Running Seed Scripts

### Option 1: Automated Script (Recommended)
```bash
# Make the script executable (first time only)
chmod +x scripts/run-seeds.sh

# Run all seeds for development
./scripts/run-seeds.sh development

# Run for staging
./scripts/run-seeds.sh staging

# Run for production (with safety confirmation)
./scripts/run-seeds.sh production
```

The script will:
- Load environment variables from `.env`
- Test database connection
- Run all seed scripts in the correct order
- Provide detailed progress and error reporting
- Show database statistics upon completion

### Option 2: Manual psql
```bash
psql -U <username> -d <database> -f scripts/seeds/001_seed_authorities.sql
psql -U <username> -d <database> -f scripts/seeds/002_seed_categories.sql
psql -U <username> -d <database> -f scripts/seeds/003_seed_test_tenants_users.sql
psql -U <username> -d <database> -f scripts/seeds/004_seed_templates.sql
psql -U <username> -d <database> -f scripts/seeds/005_seed_test_documents.sql
```

### Option 3: Using Node.js/TypeScript
```typescript
import { readFileSync } from 'fs';
import { pool } from './database';

const seedFiles = [
  '001_seed_authorities.sql',
  '002_seed_categories.sql',
  '003_seed_test_tenants_users.sql',
  '004_seed_templates.sql',
  '005_seed_test_documents.sql'
];

for (const file of seedFiles) {
  const seedSQL = readFileSync(`scripts/seeds/${file}`, 'utf8');
  await pool.query(seedSQL);
}
```

## Order of Execution

1. **Run all schema migrations first** (001-008 in migrations folder)
2. **Run seed scripts in order**:
   - 001_seed_authorities.sql (Global data)
   - 002_seed_categories.sql (Global data)
   - 003_seed_test_tenants_users.sql (Test tenants/users)
   - 004_seed_templates.sql (Sample templates)
   - 005_seed_test_documents.sql (Tenant-specific documents)

## Idempotency

All seed scripts use `ON CONFLICT (code) DO NOTHING` to ensure they can be run multiple times without errors or duplicate data.

## Environment-Specific Seeds

You may want different seed data for different environments:
- **Development**: Full set of test data (all 5 seed scripts)
- **Staging**: Subset of production-like data (001-004, skip 005)
- **Production**: Minimal essential reference data only (001-002 only)

For production, **only run**:
- 001_seed_authorities.sql
- 002_seed_categories.sql

**Skip** test tenants, users, and documents (003-005) in production!

## Testing RLS Policies

After seeding, you can test Row-Level Security with these queries:

```sql
-- Set context for Tenant 1 Admin
SELECT set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', false);
SELECT set_config('app.user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SELECT set_config('app.role', 'admin', false);

-- Should return 3 documents for Tenant 1
SELECT * FROM public.documents;

-- Change to Tenant 2 context
SELECT set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', false);
SELECT set_config('app.user_id', 'dddddddd-dddd-dddd-dddd-dddddddddddd', false);

-- Should return 2 documents for Tenant 2 (different set)
SELECT * FROM public.documents;

-- Global tables should be accessible from any tenant
SELECT * FROM public.authorities;
SELECT * FROM public.categories;
SELECT * FROM public.templates;
```

## Test Credentials

Use these credentials for testing your API:

| Tenant | Email | Password | Role |
|--------|-------|----------|------|
| Tenant 1 (Pro) | admin@tenant1.test | Test123!@# | admin |
| Tenant 1 (Pro) | member@tenant1.test | Test123!@# | member |
| Tenant 1 (Pro) | viewer@tenant1.test | Test123!@# | viewer |
| Tenant 2 (Basic) | admin@tenant2.test | Test123!@# | admin |
| Tenant 2 (Basic) | member@tenant2.test | Test123!@# | member |
| Tenant 3 (Enterprise) | admin@tenant3.test | Test123!@# | admin |
| System Admin | superadmin@complytude.test | Test123!@# | system_admin |

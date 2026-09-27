# API Development Guide

This guide covers development workflow, module creation, best practices, and code quality standards for the Complytude API application.

## Table of Contents

- [Creating a New Module](#creating-a-new-module)
- [Module Structure](#module-structure)
- [Best Practices](#best-practices)
- [Error Handling & Internationalization](#error-handling--internationalization)
- [Adding Database Migrations](#adding-database-migrations)
- [Code Quality Checks](#code-quality-checks)

---

## Creating a New Module

Use the NestJS CLI to generate new modules:

```bash
# Generate a new module (run from project root)
nest g module modules/your-module --project api

# Generate controller and service
nest g controller modules/your-module --project api
nest g service modules/your-module --project api
```

---

## Module Structure

Each module should follow this structure:

```
apps/api/src/modules/your-module/
├── your-module.module.ts        # Module definition
├── your-module.controller.ts    # HTTP endpoints
├── your-module.service.ts       # Business logic
├── dto/                         # Data Transfer Objects
│   ├── create-your-module.dto.ts
│   └── update-your-module.dto.ts
└── entities/                    # Database entities (if needed)
    └── your-module.entity.ts
```

### Example Module

```typescript
// your-module.module.ts
import { Module } from '@nestjs/common';
import { YourModuleController } from './your-module.controller';
import { YourModuleService } from './your-module.service';

@Module({
  controllers: [YourModuleController],
  providers: [YourModuleService],
  exports: [YourModuleService], // Export if needed by other modules
})
export class YourModuleModule {}
```

---

## Best Practices

### Architecture

- ✅ **Use dependency injection** - Never instantiate services manually
- ✅ **Controllers handle HTTP only** - No business logic in controllers
- ✅ **Services contain business logic** - All business rules go in services
- ✅ **Keep module boundaries clear** - Avoid circular imports
- ✅ **Export only needed providers** - Don't over-export

### Validation

- ✅ **DTOs with `class-validator`** for all inputs
- ✅ **Use `@ApiProperty()`** for Swagger documentation
- ✅ **Validate all user inputs** - Never trust external data

### Documentation

- ✅ **Use `@ApiTags()`** to group endpoints
- ✅ **Use `@ApiOperation()`** for endpoint descriptions
- ✅ **Use `@ApiResponse()`** for response documentation
- ✅ **Document all DTOs** with property decorators

### Security

- ✅ **Use `@AuthOptions()` decorator** to specify required authentication
- ✅ **Use `@AuthOptions({ tenant: true })`** for tenant-scoped endpoints
- ✅ **Use `@AuthOptions({ identity: true })`** for identity-based endpoints
- ✅ **Use `@CurrentUserTenant()` or `@CurrentUserIdentity()`** to access authenticated user
- ✅ **Add `@UseGuards(TenantPermissionsGuard)` with `@RequirePermissions()`** for permission-based access
- ✅ **Add `@UseGuards(RolesGuard)` with `@Roles()`** for simple role checks (e.g., `tenant_admin`)
- ✅ **Never expose sensitive data** in responses

### Permission-Based Authorization (RBAC)

The project uses permission-based RBAC instead of simple role checks:

```typescript
import {
  RequireAllTenantPermissions,
  RequireAnyTenantPermission,
} from 'src/common/decorators/permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/permissions.guard';

// Require ANY of the specified permissions (OR logic)
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:create')
@Post()
async createDocument() { }

// Require ALL specified permissions (AND logic)
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAllTenantPermissions('documents:read', 'documents:delete')
@Delete(':id')
async deleteDocument() { }

// Wildcard permission
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:*')
@Get()
async listDocuments() { }
```

**Permission Format:** `{resource}:{action}` (e.g., `documents:create`, `templates:manage`)

**Wildcards:** `documents:*`, `*:read`, `*:*`

**When to use which:**

| Guard                    | Use Case                       | Example                                |
| ------------------------ | ------------------------------ | -------------------------------------- |
| `TenantPermissionsGuard` | Fine-grained permission checks | `documents:create`, `templates:manage` |
| `RolesGuard`             | Simple role verification       | Check if user is `tenant_admin`        |

### Error Handling & Internationalization

All error messages must be translated using the i18n system. Never use hardcoded strings in exceptions.

**Basic error:**

```typescript
import { I18nService } from 'nestjs-i18n';
import { YourModuleI18n } from './constants/i18n.constants';

@Injectable()
export class YourService {
  constructor(private readonly i18n: I18nService) {}

  async findOne(id: string) {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundException(
        this.i18n.t(YourModuleI18n.errors.ITEM_NOT_FOUND),
      );
    }
  }
}
```

**With parameters:**

```typescript
throw new BadRequestException(
  this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_ID, {
    args: { userId: id },
  }),
);
```

**Creating i18n Keys for a New Module:**

1. Create `modules/{module}/constants/i18n.constants.ts` with `errors` and `messages` categories
2. Create locale files: `i18n/locales/en/{module}.json` and `i18n/locales/ar/{module}.json` with matching structure:

```json
{
  "errors": { "KEY_NAME": "Error message" },
  "messages": { "KEY_NAME": "Success message" }
}
```

Use single braces `{param}` for interpolation. Add keys to both `en/` and `ar/`.

### Naming Conventions

| Type       | Convention                  | Example                   |
| ---------- | --------------------------- | ------------------------- |
| Module     | `{feature}.module.ts`       | `templates.module.ts`     |
| Controller | `{feature}.controller.ts`   | `templates.controller.ts` |
| Service    | `{feature}.service.ts`      | `templates.service.ts`    |
| DTO        | `{action}-{feature}.dto.ts` | `create-template.dto.ts`  |
| Entity     | `{feature}.entity.ts`       | `template.entity.ts`      |

---

### Migration Workflow

1. **Create migration file**: `scripts/migrations/00X_description.sql`
2. **Use sequential numbering**: 001, 002, 003...
3. **Make it idempotent**: Use `IF NOT EXISTS`
4. **Run migrations**: `pnpm db:migrate`

### Example Migration

```sql
-- 004_add_user_preferences.sql

-- Create table if not exists
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
ON user_preferences(user_id);

-- Add column if not exists (PostgreSQL 11+)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'preferences_id'
    ) THEN
        ALTER TABLE users ADD COLUMN preferences_id UUID;
    END IF;
END $$;
```

### Database Commands

```bash
# Schema Management
pnpm db:migrate      # Run all migrations
pnpm db:verify       # Verify database setup

# Data Seeding (New!)
pnpm db:seed         # Seed database with initial/test data
pnpm db:setup:full   # Run migrations + seeds (complete setup)

# Database Reset
pnpm services:reset  # ⚠️ Reset database (deletes all data)
```

**When to seed:**

- After initial setup for test data
- When you need sample tenants, users, or documents
- For development and testing environments

**Seeded data includes:**

- Global authorities and categories
- Test tenants (3 different subscription plans)
- Test users with various roles
- Sample templates and documents

For detailed migration and seeding documentation, see [scripts/README.md](../../../scripts/README.md) and [scripts/seeds/README.md](../../../scripts/seeds/README.md).

---

## Testing

### Test Scripts

```bash
pnpm test                     # Run all tests (unit + integration)
pnpm test:unit                # Run unit tests only
pnpm test:integration         # Run integration tests only
pnpm test:integration:watch   # Run integration tests in watch mode
pnpm test:coverage            # Generate coverage report
```

### CI Requirements

Integration tests use [testcontainers](https://node.testcontainers.org/) to spin up ephemeral Postgres (pgvector) and Redis containers. This has implications for CI environments.

#### Docker Requirement

Testcontainers **requires a running Docker daemon**. Any CI runner must have Docker available.

- **Minimum Docker version:** 20.10+ (testcontainers v11 requirement)
- **Recommended:** Docker 24.x or later (matches local dev prerequisites)
- Rootless Docker and Podman are supported by testcontainers but may need extra config — see [testcontainers docs](https://node.testcontainers.org/supported-container-runtimes/)

#### Environment Variables

- `.env.test` is **committed to the repository** — no CI secrets are needed for test environment variables
- `DB_*` and `REDIS_*` values in `.env.test` are placeholders — `globalSetup` overrides them at runtime with testcontainer connection details
- JWT secrets, S3 keys, etc. in `.env.test` are hardcoded test values (not real credentials)

#### GitHub Actions Considerations

GitHub Actions hosted runners (`ubuntu-latest`) include Docker by default, so testcontainers works out of the box. No `services` block or Docker-in-Docker is needed — testcontainers manages its own containers.

**Example workflow snippet** (reference only — not yet implemented):

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test:unit
      - run: pnpm test:integration
```

> **Note:** Self-hosted runners must have Docker installed and the runner user must have permission to access the Docker socket (`/var/run/docker.sock`).

#### Testcontainers Architecture

The global setup (`apps/api/test/setup/global-setup.ts`) runs once before all workers:

1. Starts a **PostgreSQL container** (`pgvector/pgvector:pg16`) with a `test` superuser
2. Creates the `app_user` role (needed by migration grants)
3. Starts a **Redis container** (`redis:7-alpine`)
4. Writes connection config to a temp file for worker processes

Each Jest worker then:

1. Creates its own database (`test_w{workerId}`)
2. Runs all migrations against that database
3. Gets its own Redis DB index (0–15, capped by `maxWorkers: 16`)

This ensures full worker isolation — tests can run in parallel without conflicts.

For detailed test infrastructure documentation, see [test/README.md](../test/README.md).

---

## Code Quality Checks

### Before Committing

Always run these checks before committing:

```bash
# Lint and auto-fix
pnpm lint

# Format code
pnpm format

# Type check
pnpm type-check

# Run tests
pnpm test
```

### TypeScript Standards

```typescript
// ❌ BAD: Using 'any'
function processData(data: any) { ... }

// ✅ GOOD: Proper typing
function processData(data: ProcessedData) { ... }

// ❌ BAD: Manual instantiation
const service = new MyService();

// ✅ GOOD: Dependency injection
constructor(private readonly myService: MyService) {}

// ❌ BAD: Business logic in controller
@Post()
async create(@Body() dto: CreateDto) {
  const result = await this.db.query(...); // ❌
  return result;
}

// ✅ GOOD: Delegate to service
@Post()
async create(@Body() dto: CreateDto) {
  return this.myService.create(dto); // ✅
}
```

### ESLint Configuration

The project uses ESLint with TypeScript recommended rules. Key rules:

- No unused variables
- No explicit `any` type
- Consistent return types
- Proper async/await usage

### Prettier Configuration

- 2-space indentation
- Single quotes
- Trailing commas
- Max line width: 100 characters

---

## AI-Assisted Development

Instructions for AI coding assistants live in [`CLAUDE.md`](../../../CLAUDE.md) at the repository root: commands, architecture, conventions, and which docs to update after a change. When a change establishes or alters a convention that applies across 3+ files, update `CLAUDE.md` in the same pull request.
---

## Related Documentation

- [CONTRIBUTING.md](../../../CONTRIBUTING.md) - Git hooks, commit standards, PR process
- [CLAUDE.md](../../../CLAUDE.md) - Instructions for AI coding assistants
- [test/README.md](../test/README.md) - Testing documentation
- [scripts/README.md](../../../scripts/README.md) - Database scripts
- [Main README](../../../README.md) - Project overview
- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture
- [Database](../../../docs/DATABASE.md) - Database schema

---

[Back to API Documentation Index](README.md) | [Back to Main Documentation](../../../docs/README.md)

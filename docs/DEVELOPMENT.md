# Development Guide

This guide covers development workflow, module creation, best practices, and code quality standards for the Complytude project.

## Table of Contents

- [Monorepo Structure](#monorepo-structure)
- [Creating a New Module](#creating-a-new-module)
- [Module Structure](#module-structure)
- [Using Shared Library](#using-shared-library)
- [Best Practices](#best-practices)
- [Adding Database Migrations](#adding-database-migrations)
- [Code Quality Checks](#code-quality-checks)

---

## Monorepo Structure

Complytude uses a **NestJS monorepo** with pnpm workspaces:

```
backend/
├── apps/
│   ├── api/                 # Main API (NestJS + Fastify)
│   ├── worker-ingestion/    # File processing worker
│   └── worker-ai/           # LLM orchestration worker
├── libs/
│   └── shared/              # Shared code (@complytude/shared)
├── package.json             # Workspace manager
└── pnpm-workspace.yaml      # Workspace config
```

### Common Commands

```bash
# Install all dependencies
pnpm install

# Build shared library (do this first!)
pnpm build:shared

# Start API in development
pnpm start:api

# Build specific app
pnpm build:api
pnpm build:worker-ingestion
pnpm build:worker-ai

# Run all apps in parallel
pnpm start:all
```

---

## Creating a New Module

### For API Modules

Use the NestJS CLI to generate new modules in the API app:

```bash
# Generate a new module in the API app
nest g module modules/your-module --project api

# Generate controller and service
nest g controller modules/your-module --project api
nest g service modules/your-module --project api
```

### For Worker Modules

Workers have simpler structure - manually create files in `apps/worker-*/src/`.

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
import { DatabaseModule } from '@complytude/shared';  // Import from shared
import { YourModuleController } from './your-module.controller';
import { YourModuleService } from './your-module.service';

@Module({
  imports: [DatabaseModule],  // Use shared DatabaseModule
  controllers: [YourModuleController],
  providers: [YourModuleService],
  exports: [YourModuleService], // Export if needed by other modules
})
export class YourModuleModule {}
```

---

## Using Shared Library

The `@complytude/shared` library contains reusable code for all apps.

### What's in Shared Library

| Category | Examples |
|----------|----------|
| **Database** | `DatabaseService`, `DatabaseModule` |
| **Repositories** | `UserRepository`, `TenantRepository`, etc. |
| **DTOs** | `PaginationQueryDto`, `MessageResponseDto` |
| **Guards** | `SystemAdminGuard`, `FeaturesGuard` |
| **Decorators** | `@RequirePermissions()`, `@AuditAction()` |
| **Interceptors** | `TenantInterceptor`, `UsageTrackingInterceptor` |
| **Constants** | `I18nKeys`, error codes |

### Importing from Shared

```typescript
// ✅ CORRECT: Import from @complytude/shared
import {
  DatabaseService,
  UserRepository,
  PaginationQueryDto,
  SystemAdminGuard
} from '@complytude/shared';

// ❌ WRONG: Don't use relative paths to libs/
import { DatabaseService } from '../../../libs/shared/src/database';
```

### Adding New Exports

When adding new shared code:

1. Create the file in `libs/shared/src/`
2. Export it in `libs/shared/src/index.ts`
3. Rebuild: `pnpm build:shared`

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

- ✅ **Add guards** for authentication and authorization
- ✅ **Use `@UseGuards(JwtAuthGuard)`** for protected routes
- ✅ **Use `@TenantId()` decorator** for tenant context
- ✅ **Never expose sensitive data** in responses

### Naming Conventions

| Type       | Convention                  | Example                   |
| ---------- | --------------------------- | ------------------------- |
| Module     | `{feature}.module.ts`       | `templates.module.ts`     |
| Controller | `{feature}.controller.ts`   | `templates.controller.ts` |
| Service    | `{feature}.service.ts`      | `templates.service.ts`    |
| DTO        | `{action}-{feature}.dto.ts` | `create-template.dto.ts`  |
| Entity     | `{feature}.entity.ts`       | `template.entity.ts`      |

---

## Adding Database Migrations

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
pnpm docker:reset    # ⚠️ Reset database (deletes all data)
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

For detailed migration and seeding documentation, see [scripts/README.md](../scripts/README.md) and [scripts/seeds/README.md](../scripts/seeds/README.md).

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

## Related Documentation

- [CONTRIBUTING.md](../CONTRIBUTING.md) - Git hooks, commit standards
- [test/README.md](../test/README.md) - Testing documentation
- [scripts/README.md](../scripts/README.md) - Database scripts
- [Main README](../README.md) - Project overview

---

[Back to Documentation Index](README.md)

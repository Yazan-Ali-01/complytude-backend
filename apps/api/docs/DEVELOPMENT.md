# API Development Guide

This guide covers development workflow, module creation, best practices, and code quality standards for the Complytude API application.

## Table of Contents

- [Creating a New Module](#creating-a-new-module)
- [Module Structure](#module-structure)
- [Best Practices](#best-practices)
- [Internationalization (i18n)](#internationalization-i18n)
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
├── constants/                   # Module constants
│   └── i18n.constants.ts       # Translation keys (errors/messages)
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

### Naming Conventions

| Type       | Convention                  | Example                   |
| ---------- | --------------------------- | ------------------------- |
| Module     | `{feature}.module.ts`       | `templates.module.ts`     |
| Controller | `{feature}.controller.ts`   | `templates.controller.ts` |
| Service    | `{feature}.service.ts`      | `templates.service.ts`    |
| DTO        | `{action}-{feature}.dto.ts` | `create-template.dto.ts`  |
| Entity     | `{feature}.entity.ts`       | `template.entity.ts`      |

---

## Internationalization (i18n)

The API uses **nestjs-i18n** with a **per-module organization** strategy for translation keys.

### Quick Start

1. **Define module constants** (if creating a new module):

```typescript
// modules/your-module/constants/i18n.constants.ts
export const YourModuleI18n = {
  errors: {
    RESOURCE_NOT_FOUND: 'your-module.errors.RESOURCE_NOT_FOUND',
    CREATION_FAILED: 'your-module.errors.CREATION_FAILED',
  },
  messages: {
    CREATED_SUCCESS: 'your-module.messages.CREATED_SUCCESS',
    UPDATED_SUCCESS: 'your-module.messages.UPDATED_SUCCESS',
  },
} as const;
```

2. **Add JSON translations** for both languages:

```json
// i18n/locales/en/your-module.json
{
  "errors": {
    "RESOURCE_NOT_FOUND": "Resource not found",
    "CREATION_FAILED": "Failed to create resource"
  },
  "messages": {
    "CREATED_SUCCESS": "Resource created successfully",
    "UPDATED_SUCCESS": "Resource updated successfully"
  }
}
```

```json
// i18n/locales/ar/your-module.json
{
  "errors": {
    "RESOURCE_NOT_FOUND": "المورد غير موجود",
    "CREATION_FAILED": "فشل في إنشاء المورد"
  },
  "messages": {
    "CREATED_SUCCESS": "تم إنشاء المورد بنجاح",
    "UPDATED_SUCCESS": "تم تحديث المورد بنجاح"
  }
}
```

3. **Export from common constants** (for type safety):

```typescript
// common/constants/i18n.constants.ts
export { YourModuleI18n } from '../../modules/your-module/constants/i18n.constants';

// Add to I18nKeyType union
export type I18nKeyType =
  | DeepValues<typeof CommonI18n>
  | DeepValues<typeof YourModuleI18n>
  // ... other modules
```

4. **Update TranslationNamespace type**:

```typescript
// i18n/i18n.types.ts
export type TranslationNamespace =
  | 'common'
  | 'your-module'
  // ... other namespaces
```

5. **Use in your service**:

```typescript
import { YourModuleI18n } from './constants/i18n.constants';
import { CommonI18n } from '../../common/constants/i18n.constants';

@Injectable()
export class YourModuleService {
  constructor(@I18n() private readonly i18n: I18nService) {}

  async create(data: CreateDto) {
    // Use module-specific keys
    throw new ConflictException(
      this.i18n.t(YourModuleI18n.errors.CREATION_FAILED)
    );
    
    // Or shared keys
    throw new NotFoundException(
      this.i18n.t(CommonI18n.errors.NOT_FOUND)
    );
    
    return {
      message: this.i18n.t(YourModuleI18n.messages.CREATED_SUCCESS)
    };
  }
}
```

### Existing Module Constants

- **CommonI18n** - `common/constants/i18n.constants.ts` (VALIDATION_ERROR, NOT_FOUND, UNAUTHORIZED, etc.)
- **AuthI18n** - `modules/auth/constants/i18n.constants.ts`
- **TemplatesI18n** - `modules/templates/constants/i18n.constants.ts`
- **StorageI18n** - `modules/storage/constants/i18n.constants.ts`
- **TenantsI18n** - `modules/tenants/constants/i18n.constants.ts`
- **EntitlementsI18n** - `modules/entitlements/constants/i18n.constants.ts`

### Guidelines

- **errors** - Exception messages (validation failures, not found, access denied, etc.)
- **messages** - Success messages (created, updated, deleted successfully, etc.)
- **Use CommonI18n for generic errors** (NOT_FOUND, UNAUTHORIZED, VALIDATION_ERROR)
- **Use module-specific constants for domain-specific messages**
- **Always provide fallback strings** for resilience: `this.i18n.t(key) ?? 'Fallback message'`

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

For detailed migration and seeding documentation, see [scripts/README.md](../../../scripts/README.md) and [scripts/seeds/README.md](../../../scripts/seeds/README.md).

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

This project uses Cursor AI rules to maintain consistency and enforce best practices. The rules are located in `.cursor/rules/` and provide guidance on project structure, NestJS patterns, and technology stack.

### Available Rules

Cursor rules in `.cursor/rules/` (at project root) provide:

- **[nest-js.mdc](../../../.cursor/rules/nest-js.mdc)** - Core NestJS patterns and database architecture
- **[project-structure.mdc](../../../.cursor/rules/project-structure.mdc)** - Complete project navigation guide
- **[technology-stack.mdc](../../../.cursor/rules/technology-stack.mdc)** - Dependencies, versions, and compatibility
- **[cursor-rules.mdc](../../../.cursor/rules/cursor-rules.mdc)** - How to maintain these rules
- **[self-improvement.mdc](../../../.cursor/rules/self-improvement.mdc)** - When to update rules

### Using AI for Development

When working with Cursor AI:

1. **Generate New Modules**: AI will follow the established patterns from `nest-js.mdc`
2. **Navigate Codebase**: AI uses `project-structure.mdc` to understand file locations
3. **Check Dependencies**: AI references `technology-stack.mdc` for version compatibility
4. **Maintain Consistency**: AI enforces patterns defined in the rules

### When to Update Rules

Update `.cursor/rules/` when:

#### Add New Rules When:

- A new technology/pattern is used in **3+ files**
- Common bugs could be prevented by a rule
- Code reviews repeatedly mention the same feedback
- New security or performance patterns emerge
- New dependencies are added

#### Modify Existing Rules When:

- Better examples exist in the codebase
- Additional edge cases are discovered
- Dependencies are updated (update `technology-stack.mdc`)
- Project structure changes (update `project-structure.mdc`)
- Development patterns evolve

#### Which Rule to Update:

| Scenario                                 | Rule to Update          |
| ---------------------------------------- | ----------------------- |
| New NestJS pattern or database approach  | `nest-js.mdc`           |
| New module, folder, or file organization | `project-structure.mdc` |
| Dependency update or new tool added      | `technology-stack.mdc`  |
| Rule writing process changes             | `cursor-rules.mdc`      |
| Rule maintenance workflow changes        | `self-improvement.mdc`  |

### Example: Updating Rules for New Pattern

If you implement a new decorator pattern used across multiple controllers:

```bash
# 1. Edit the appropriate rule file
code .cursor/rules/nest-js.mdc

# 2. Add the pattern under "Common Patterns" section
# Include:
# - Description of when to use it
# - Code example from actual codebase
# - Best practices

# 3. Commit the change
git add .cursor/rules/nest-js.mdc
git commit -m "docs(rules): add custom decorator pattern for rate limiting"
```

### Using AI to Update or Generate Rules

Cursor AI can help you update existing rules or generate new ones based on your code patterns.

#### Update Rules Automatically

**After updating dependencies:**

```
@cursor-rules.mdc @package.json Analyze all major dependencies
and update the @technology-stack.mdc rule with the latest versions of the dependencies, outlining the best practices for those versions.
```

**After restructuring the project:**

```
@cursor-rules.mdc @src/ Analyze the current project structure
and update the @project-structure.mdc rule to reflect any new modules, folders, or organizational changes.
```

#### Generate Rules from Code

**From a NestJS service:**

```
@cursor-rules.mdc @apps/api/src/modules/templates/templates.service.ts
/Generate Cursor Rules
I want to generate a cursor rule for this NestJS service. Please analyze it carefully and outline all of the conventions found (dependency injection, error handling, business logic patterns, repository usage, transaction handling). Output as one rule file only.
```

**From a repository:**

```
@cursor-rules.mdc @apps/api/src/repositories/users/users.repository.ts
/Generate Cursor Rules
I want to generate a cursor rule for this repository. Please analyze it carefully and outline all of the conventions found (BaseRepository extension, mapRow implementation, query patterns, tenant context handling). Output as one rule file only.
```

**From a utility function:**

```
@cursor-rules.mdc @apps/api/src/common/helper.ts
/Generate Cursor Rules
I want to generate a cursor rule for this utility function module. Analyze it carefully and outline all of the conventions found (function naming, parameter validation, error handling, type safety). Output as one rule file only.
```

**From a DTO:**

```
@cursor-rules.mdc @apps/api/src/modules/templates/dto/create-template.dto.ts
/Generate Cursor Rules
I want to generate a cursor rule for this DTO. Analyze it carefully and outline all of the conventions found (class-validator decorators, Swagger documentation, validation rules). Output as one rule file only.
```

**Important:** Always review and refine AI-generated rules before committing them. See [cursor-rules.mdc](../../../.cursor/rules/cursor-rules.mdc) for complete examples and best practices.

### When to Create or Update a Rule

#### Create a New Rule When:

You should create a new Cursor rule when:

1. ✅ **Pattern repeats 3+ times** - You've implemented the same pattern in multiple files
2. ✅ **Preventing bugs** - A rule could prevent common mistakes
3. ✅ **Code review feedback** - Same comments appear in multiple reviews
4. ✅ **Onboarding questions** - New team members repeatedly ask about the same pattern
5. ✅ **Framework best practices** - Enforcing NestJS, TypeScript, or PostgreSQL patterns

**Example scenarios:**

- You've created 3 repositories following the same BaseRepository pattern → Create rule
- Multiple DTOs use the same validation approach → Create rule
- Several services handle errors the same way → Create rule

#### Update an Existing Rule When:

1. ✅ **Dependencies updated** - After `pnpm update` (update `technology-stack.mdc`)
2. ✅ **Structure changes** - New modules added (update `project-structure.mdc`)
3. ✅ **Better examples found** - Improved implementation in codebase
4. ✅ **Edge cases discovered** - New scenarios to document
5. ✅ **Patterns evolve** - Better approaches are established

#### Don't Create/Update Rules When:

1. ❌ **One-off implementation** - Pattern used in only 1-2 files
2. ❌ **Experimental code** - Pattern might change or be removed
3. ❌ **File-specific logic** - Doesn't apply to other files
4. ❌ **Already documented** - Covered by existing rules

### Common Mistakes to Avoid

#### Over-Generating Rules

Don't create a rule for every single file. This leads to:

- Rule bloat and maintenance burden
- Confusion about which rules to follow
- Difficulty finding relevant rules

**Focus on:**

- ✅ Patterns that repeat across multiple files
- ✅ Common sources of bugs or confusion
- ✅ Framework-specific best practices (NestJS, Fastify, PostgreSQL)
- ✅ Team coding standards that need enforcement

**Avoid:**

- ❌ Rules for one-off implementations
- ❌ Rules for experimental features
- ❌ Rules for file-specific business logic

#### Rules That Are Too Specific

Good rules should be general enough to apply to multiple similar situations.

**Examples:**

| Too Specific ❌                               | Better ✅                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| "UserService must hash passwords with bcrypt" | "All services handling passwords must use bcrypt with 10-12 salt rounds"  |
| "create-user.dto.ts must validate email"      | "All DTOs with email fields must use @IsEmail() validator"                |
| "AuthController must use JwtAuthGuard"        | "All protected endpoints must use appropriate auth guards (@AuthOptions)" |
| "UserRepository must extend BaseRepository"   | "All repositories must extend BaseRepository and implement mapRow()"      |

### Best Practices for Rule Management

#### Quality Over Quantity

- Start with **5-10 core rules** covering main patterns
- Add more as project grows and patterns stabilize
- Better to have 5 excellent rules than 20 mediocre ones

**Current project rules:**

1. `nest-js.mdc` - Core NestJS patterns and database architecture
2. `project-structure.mdc` - Project organization and navigation
3. `technology-stack.mdc` - Dependencies, versions, and compatibility
4. `cursor-rules.mdc` - Rule file structure and location
5. `self-improvement.mdc` - Rule maintenance guidelines

#### The 3-File Rule

Before creating a rule, ask:

- "Is this pattern used in at least 3 different files?"
- "Will this pattern be used in future files?"
- "Does this prevent bugs or confusion?"

If you answer "no" to all three, document it in code comments instead.

#### Review and Refine

AI-generated rules need human review:

1. ✅ Verify examples match actual codebase
2. ✅ Ensure patterns are stable and proven
3. ✅ Add context about why the pattern exists
4. ✅ Cross-reference related rules
5. ✅ Test by asking AI to generate code following the rule

### FAQ About Cursor Rules

**Q: What's the best way to generate Cursor rules?**

A: Use the `/Generate Cursor Rules` command with the appropriate file. It handles 90% of rule creation. You might need to tweak or combine rules, but manual writing is rarely necessary.

```
@cursor-rules.mdc @src/modules/your-module/service.ts
/Generate Cursor Rules
I want to generate a cursor rule for this NestJS service...
```

**Q: How many rules should we have?**

A: Start with 5-10 core rules. Our project currently has 5 main rules, which is a good baseline. Add more only when clear patterns emerge across multiple files.

**Q: Should I create a rule for every module?**

A: No. Only create rules for patterns that apply across multiple modules. Module-specific logic should be documented in code comments or module-level README files.

**Q: How do I know if a rule is too specific?**

A: Ask: "Can this rule apply to at least 3 different files or situations?" If not, it's probably too specific. Consider documenting it as a code comment instead.

**Q: What if I'm not sure whether to create a rule?**

A: When in doubt, wait. Document the pattern in code comments first. If you find yourself copying that comment to multiple files, then it's time to create a rule.

### Rule Maintenance Best Practices

- ✅ Keep examples synchronized with actual code
- ✅ Update references to external documentation
- ✅ Cross-reference related rules using MDC links
- ✅ Document breaking changes when they occur
- ✅ Remove or deprecate outdated patterns

For detailed information on rule maintenance, see [self-improvement.mdc](../../../.cursor/rules/self-improvement.mdc).

---

## Related Documentation

- [CONTRIBUTING.md](../../../CONTRIBUTING.md) - Git hooks, commit standards, Cursor rules
- [test/README.md](../test/README.md) - Testing documentation
- [scripts/README.md](../../../scripts/README.md) - Database scripts
- [Main README](../../../README.md) - Project overview
- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture
- [Database](../../../docs/DATABASE.md) - Database schema

---

[Back to API Documentation Index](README.md) | [Back to Main Documentation](../../../docs/README.md)

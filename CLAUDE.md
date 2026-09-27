# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Complytude is a UAE-focused SaaS backend for legal document generation and compliance management. It is a **pnpm monorepo** with 4 NestJS applications and 10 shared libraries, using PostgreSQL 16 (with pgvector), Redis 7, and BullMQ for background jobs.

**Status: PRE-PRODUCTION** — breaking changes are fine. Edit existing migrations rather than creating new ones unless the change is large and independent. What changes at the first production deployment is listed under "Leaving pre-production" in `CONTRIBUTING.md`.

---

## Commands

### Daily Development

```bash
pnpm dev              # Start API + Docker services with hot-reload (recommended)
pnpm dev:all          # Start API + all workers
pnpm start:worker-ai          # AI worker only (watch mode)
pnpm start:worker-ingestion   # Ingestion worker only (watch mode)
pnpm start:worker-generation  # Generation worker only (watch mode)
```

### Database

```bash
pnpm db:migrate       # Run all migrations
pnpm db:seed          # Seed database
pnpm services:up      # Start PostgreSQL + Redis
pnpm services:reset   # Full reset: down -v → up → migrate → seed
```

### Code Quality

```bash
pnpm lint             # ESLint with auto-fix
pnpm format           # Prettier
pnpm type-check       # TypeScript validation
```

### Testing

```bash
pnpm test             # All tests
pnpm test:unit        # Unit tests only (no Docker needed)
pnpm test:integration # Integration tests (Docker required)
pnpm test:integration:watch  # Watch mode
pnpm test:coverage    # Coverage report
```

Run a single test file:
```bash
pnpm test:unit -- --testPathPattern=users.service
pnpm test:integration -- --testPathPattern=users.integration
```

### Build

```bash
pnpm build:api        # Build API only
pnpm build:all        # Build all apps
```

---

## Architecture

### Monorepo Layout

```
apps/
  api/                  # Main REST API (NestJS + Fastify)
  worker-ai/            # AI document analysis (BullMQ consumer)
  worker-ingestion/     # Ruleset chunking + embedding + document extraction
  worker-generation/    # DOCX → PDF via Gotenberg
libs/
  database/             # pg driver, DatabaseService, BaseRepository
  embedding/            # OpenAI embeddings + text chunking
  queue/                # BullMQ abstraction (producer + abstract processor)
  redis/                # ioredis wrapper
  storage/              # S3Client + basic S3 operations
  context/              # Request context
  logger/               # Pino logging
  pdf/                  # PDF operations
  docx-renderer/        # DOCX rendering
  audit/                # Audit logging
scripts/
  migrations/           # SQL migration files (edit in place, pre-prod)
  seeds/                # SQL seed files
docs/                   # Architecture, database, RBAC, entitlements, billing docs
```

All shared libraries are imported via path aliases: `@lib/database`, `@lib/queue`, etc.

### Layer Separation (NestJS API)

- **Controllers** — HTTP only, no business logic
- **Services** — Business logic, orchestration
- **Repositories** — All DB access via raw SQL (`pg` driver, no ORM). Live in `apps/api/src/repositories/`, extend `BaseRepository` from `@lib/database`
- **DTOs** — Input validation (`class-validator`) and output shaping (`@ApiProperty`)

### Conventions

- **File names:** `{feature}.module.ts`, `{feature}.controller.ts`, `{feature}.service.ts`, `{feature}.repository.ts`, DTOs as `{action}-{feature}.dto.ts`.
- **Modules:** dependency injection only (never `new` a service). No circular module imports. Export only the providers other modules need.
- **Global modules:** `DatabaseModule`, `ContextModule`, `TenantRbacModule`, `PlatformRbacModule`, `EntitlementsModule`, and the Stripe webhook/billing modules are `@Global()`. Use their providers directly; don't add them to a feature module's `imports`.
- **Mock modules:** `modules/mock` and `modules/rag-mock` are dev-only demo routes. `app.module.ts` mounts them only when `ENABLE_MOCK_ROUTES=true` and `NODE_ENV` isn't `production` (the env schema rejects the flag in production). Never import them from another module.
- **Config:** every env var is validated at startup by the Joi schema in `apps/api/src/config/env.schema.ts`. When you add, rename or remove one, update `apps/api/.env.example` in the same change. Never hardcode secrets.
- **Types:** no `any`. Give function parameters and return values explicit types.
- **Swagger:** document every endpoint (`@ApiOperation`, `@ApiResponse` with a response DTO, `@ApiProperty` on DTO fields).
- **Comments:** only where business logic is non-obvious.
- **`file-type` v21 is ESM-only:** load it with a dynamic `import()`. Jest maps it to `apps/api/test/mocks/file-type.mock.ts`.

### Database

Uses raw `pg` driver (no ORM) with Row-Level Security for multi-tenancy.

```typescript
// Always use transactionWithTenantContext for tenant-scoped data
await this.databaseService.transactionWithTenantContext({ tenantId }, async (client) => {
  // RLS is automatically enforced — app.tenant_id session variable is set
});

// For system-wide operations (bypasses tenant RLS)
await this.databaseService.transactionWithPlatformAdminContext(async (client) => { ... });
```

`DatabaseService` (`libs/database/src/database.service.ts`):

| Method | RLS context |
|---|---|
| `query(text, params)` | None. Only for global, non-tenant tables. |
| `transaction(callback)` | None. |
| `transactionWithTenantContext({ tenantId, isTenantAdmin?, allowCrossTenantRead? }, callback)` | Sets `app.tenant_id`, `app.is_tenant_admin`, `app.allow_cross_tenant_read`. Pass `isTenantAdmin: true` for update/delete policies that require it, and `allowCrossTenantRead: true` only for deliberate cross-tenant reads such as slug-uniqueness checks. |
| `transactionWithPlatformAdminContext(callback)` | Sets `app.platform_role`. |

Context is set with `set_config(..., true)`, so it is transaction-scoped and never leaks between pooled connections. Policies read it through `current_tenant_id_or_null()` and fail closed: with no context, a read silently returns 0 rows (it does not error) and a write is rejected. If a tenant-scoped query unexpectedly returns nothing, check that it runs inside `transactionWithTenantContext`.

**Repository pattern:** All repositories extend `BaseRepository<TEntity, TCreate, TUpdate>`, implement `mapRow(row)` and `getSelectColumns()`, run SQL through `executeQuery()`, and never use `SELECT *`. Always use parameterised SQL.

**JSON/JSONB columns:** services `JSON.stringify` values before passing them to a repository. The `TCreate`/`TUpdate` types carry the string, and `mapRow()` parses it back into an object for `TEntity`.

**Migrations:** Edit files in `scripts/migrations/` directly (pre-production). After editing, run `pnpm services:reset` for a clean state. Only create a new migration file for large, independent features.

### Authentication — Dual-Token System

Two separate JWT token pairs flow as HTTP cookies:

| Token | Cookie Name | Used For |
|---|---|---|
| Identity access | `identityAccessToken` | User identity, platform admin ops |
| Identity refresh | `identityRefreshToken` | Identity token renewal |
| Tenant access | `tenantAccessToken` | Tenant-scoped API calls |
| Tenant refresh | `tenantRefreshToken` | Tenant token renewal |

Use `@AuthOptions()` decorator on controllers:

```typescript
@AuthOptions({ identity: true })         // identity token only
@AuthOptions({ tenant: true })           // tenant token only
@AuthOptions({ identity: true, tenant: true })  // both
@Public()                                // no token (login, signup, webhooks, health)
```

The global `JwtAuthGuard` is deny-by-default: a route with none of `@AuthOptions`, `@AuthRefreshOptions` (refresh endpoints, checked by `JwtAuthRefreshGuard`) or `@Public()` returns 401. `apps/api/test/auth/route-auth-inventory.integration.spec.ts` lists every public route, so a new one fails that test until it's added there.

Use `@CurrentUserIdentity()` and `@CurrentUserTenant()` to extract user info from the request.

### RBAC

Two independent RBAC systems, both are **global modules** — never import them in feature modules.

**Tenant RBAC** (requires tenant token):
```typescript
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:create')
```

**Platform RBAC** (requires identity token):
```typescript
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('tenants:create')
```

`RequireAny*Permission(...)` passes if the user has **any** of the listed permissions; `RequireAll*Permissions(...)` needs **all** of them. Wildcards are supported (`documents:*`, `*:*`).

`TenantPermissionsGuard`, `PlatformPermissionsGuard` and `RolesGuard` return 403 when applied without their metadata, so put each `@UseGuards(...)` next to the `@Require…`/`@Roles(...)` it enforces rather than on a class whose handlers don't all declare one.

System roles: tenant `tenant_admin`, `legal_counsel`, `member`, `viewer`; platform `system_admin`, `support`, `auditor`. Their permission sets are in-memory maps in `common/constants/{tenant,platform}-system-roles.constant.ts`.

Adding new permissions: add to the `TENANT_PERMISSIONS` / `PLATFORM_PERMISSIONS` object in `tenant-permissions.constant.ts` or `platform-permissions.constant.ts` (the single source of truth; the `ALL_*` arrays are derived from it). `TenantRbacSyncService` / `PlatformRbacSyncService` write it to the DB on startup.

### Background Jobs

Producer/consumer pattern with BullMQ:

- **API** dispatches jobs via `QueueProducerService` (never import BullMQ directly in API)
- **Workers** extend `AbstractProcessor` from `@lib/queue` and are registered with `@Processor('queue-name')`

Queues: `ai-processing`, `data-ingestion`, `entitlement-processing`, `tenant-processing`, `billing-processing`, `document-generation`. Reference them via `QUEUE_NAMES` (`libs/queue/src/queue.constants.ts`); job payload types live in `libs/queue/src/interfaces/{queue}.jobs.ts`.

Each worker is a standalone NestJS app with the same layout:

```
apps/worker-{name}/src/
  main.ts                    # bootstrap
  worker-{name}.module.ts    # root module, imports @lib/* libraries
  config/                    # worker-specific config
  processors/                # BullMQ processors (extend AbstractProcessor)
  services/                  # business logic
  repositories/              # worker-owned data access
```

### Entitlements

Production-grade entitlement engine with plan-based access, usage tracking (append-only ledger), and credit fallback. Features and plans are synced from constants (`common/constants/plan-entitlements.constant.ts`) to the DB on every startup by `EntitlementSyncService`. See `docs/ENTITLEMENTS.md` for enforcement patterns.

### Audit Logging

Opt-in, method-level. Only handlers decorated with `@Audit()` (`common/decorators/audit.decorator.ts`) are recorded:

```typescript
@Audit('CONTRACT_EXPORTED', { resourceIdParam: 'id' })  // resource ID from a route param
@Audit('TEMPLATE_CREATED', { includeBody: true })       // include the sanitised request body
@Audit('USER_PASSWORD_CHANGED', { resourceType: 'users' })
```

The resource type defaults to the first segment of the controller path. `AuditInterceptor` writes to `audit_logs` through `@lib/audit` on 2xx responses only, fire-and-forget.

### i18n

All user-facing strings go through `nestjs-i18n`, in both English and Arabic. Define translation keys in `modules/{module}/constants/i18n.constants.ts` (under `errors` / `messages`); shared keys live in `common/constants/i18n.constants.ts`. Translations live in `apps/api/src/i18n/locales/{en,ar}/`.

---

## Testing Conventions

**Unit tests** (`*.spec.ts`) — co-located with source, mock all dependencies.

**Integration tests** (`*.integration.spec.ts`) — live in `apps/api/test/`, use real PostgreSQL + Redis via testcontainers.

Every integration test file must follow this boilerplate:

```typescript
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

describe('Feature', () => {
  let app: TestApp;

  beforeAll(async () => { app = await createTestApp(); }, 60000);
  beforeEach(async () => { await resetTestState(app.databaseService, app.redisClient); }, 15000);
  afterAll(async () => { if (app) await app.cleanup(); }, 30000);
});
```

Use factories from `apps/api/test/factories/` to create test data. `StorageService` and `AuditService` are auto-mocked in `createTestApp()`.

---

## Git Conventions

### Branches

Always branch off `development`. Target `development` for all PRs — `main` is production-only.

```
feature/short-description     # new functionality
fix/short-description         # bug fixes
refactor/short-description    # code changes with no functional impact
chore/short-description       # tooling, deps, config
docs/short-description        # documentation only
```

### Commit Messages

Enforced by commitlint (Husky `commit-msg` hook). Format:

```
type(scope): short description (COM-123)

- Bullet point explaining what changed
- Another change

Closes COM-123
```

**Allowed types:** `feat` | `fix` | `refactor` | `test` | `docs` | `chore`

**Rules enforced:**
- Scope is **required** — use the module/area name (`auth`, `templates`, `storage`, `tenant`, `database`, `entitlements`, etc.)
- Header max **100 characters**
- Imperative mood, lowercase, no trailing period
- Body lines max **160 characters**
- `Closes COM-xxx` or `Fixes COM-xxx` in footer when the commit completes a Linear issue

**Examples:**

```
feat(auth): add email verification flow (COM-15)

- Create email verification endpoint
- Add email service integration
- Update user schema with verification status

Closes COM-15
```

```
fix(storage): resolve file upload timeout issue (COM-28)

- Increase upload timeout to 60 seconds
- Add retry logic for S3 operations

Fixes COM-28
```

```
refactor(database): optimize tenant isolation queries (COM-42)

- Use prepared statements for tenant queries
- Reduce database round trips

Closes COM-42
```

The pre-commit hook also runs `pnpm type-check` and `lint-staged` before every commit. Never skip hooks (`--no-verify`) except in genuine emergencies — it will break CI.

### Pull Requests

- Open against **`development`**, never directly against `main`
- Title mirrors the commit format: `feat(auth): add email verification (COM-15)`
- Description should include:
  - **What** changed and **why** (not a repeat of the diff)
  - Link to the Linear issue (`COM-xxx`)
  - Any migration or env var changes that reviewers need to know about
  - Steps to test manually if the change is non-obvious
- Keep PRs focused — one logical change per PR; split unrelated fixes into separate branches
- Ensure `pnpm lint`, `pnpm type-check`, and `pnpm test` all pass before requesting review

---

## Key Documentation

| Topic | Location |
|---|---|
| System architecture | `docs/ARCHITECTURE.md` |
| Database schema + RLS | `docs/DATABASE.md` |
| RBAC (full guide) | `docs/RBAC.md` |
| Entitlement system | `docs/ENTITLEMENTS.md` |
| Billing + Stripe | `docs/BILLING.md`, `docs/STRIPE_DEVELOPMENT.md` |
| API contracts (auth flows) | `apps/api/docs/API_CONTRACTS.md` |
| Test infrastructure | `apps/api/test/README.md` |

---

## Implementation Workflow

Before writing code: search existing patterns in the codebase, check the relevant docs, and clarify ambiguities rather than assuming schema, API contracts, config or business rules.

After a significant change, suggest the doc updates it needs, and ask before making them. Significant means: a new module, service, repository, library or dependency; a schema change; a renamed or removed file or directory; a new guard, decorator, interceptor or other architectural pattern; a new or significantly changed endpoint; a new env var; a new worker or job type. Skip this for typo fixes, small bug fixes and internal refactors that don't change a pattern.

| Changed | Update |
|---|---|
| Architecture, modules, design decisions | `docs/ARCHITECTURE.md` |
| Schema, RLS | `docs/DATABASE.md`, `docs/database-schema.dbml` |
| Permissions, roles | `docs/RBAC.md` |
| Plans, features, enforcement | `docs/ENTITLEMENTS.md` |
| Endpoints, auth flows | `apps/api/docs/API_CONTRACTS.md` |
| Worker behaviour | `apps/worker-*/docs/` |
| Test infrastructure (setup, factories, helpers, mocks) | `apps/api/test/README.md` and the directory tree in `CONTRIBUTING.md` |
| A convention that now applies across 3+ files | this file |

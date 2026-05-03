# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Complytude is a UAE-focused SaaS backend for legal document generation and compliance management. It is a **pnpm monorepo** with 4 NestJS applications and 10 shared libraries, using PostgreSQL 16 (with pgvector), Redis 7, and BullMQ for background jobs.

**Status: PRE-PRODUCTION** — breaking changes are fine. Edit existing migrations rather than creating new ones unless the change is large and independent.

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

**Repository pattern:** All repositories extend `BaseRepository<TEntity, TCreate, TUpdate>`, implement `mapRow(row)` and `getSelectColumns()`, and never use `SELECT *`.

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
// No decorator = public endpoint
```

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

Adding new permissions: add to the relevant constants file (`tenant-permissions.constant.ts` or `platform-permissions.constant.ts`) — sync services handle DB updates on startup.

### Background Jobs

Producer/consumer pattern with BullMQ:

- **API** dispatches jobs via `QueueProducerService` (never import BullMQ directly in API)
- **Workers** extend `AbstractProcessor` from `@lib/queue` and are registered with `@Processor('queue-name')`

Queues: `ai-processing`, `data-ingestion`, `entitlement-processing`, `tenant-processing`, `billing-processing`, `document-generation`

### Entitlements

Production-grade entitlement engine with plan-based access, usage tracking (append-only ledger), and credit fallback. Features and plans are synced from constants (`common/constants/plan-entitlements.constant.ts`) to the DB on every startup by `EntitlementSyncService`. See `docs/ENTITLEMENTS.md` for enforcement patterns.

### Audit Logging

Two-level decorator + interceptor. Place `@AuditResource('resource-name')` on the controller and `@AuditAction('action')` on individual methods. The interceptor fires async (fire-and-forget) after the handler.

### i18n

All user-facing strings go through `nestjs-i18n`. Define translation keys in `modules/{module}/constants/i18n.constants.ts`. Translations live in `apps/api/src/i18n/locales/{en,ar}/`. After adding/changing env vars in `env.schema.ts`, always update `apps/api/.env.example`.

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

Before writing code: search existing patterns in the codebase, check relevant docs, and clarify ambiguities. After significant changes (new module, schema change, new env var, new architectural pattern), suggest updating the relevant docs and `.cursor/rules/` files.

# Testing — Complytude API

This document covers the test infrastructure, conventions, and how to write tests for the Complytude API.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Scripts](#test-scripts)
- [Architecture](#architecture)
- [Test Naming Convention](#test-naming-convention)
- [Directory Structure](#directory-structure)
- [Writing Integration Tests](#writing-integration-tests)
- [Test Utilities Reference](#test-utilities-reference)
- [CI Requirements](#ci-requirements)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Ensure Docker is running (required for integration tests)
docker info

# Run all tests
pnpm test

# Run only unit tests (no Docker needed)
pnpm test:unit

# Run only integration tests (Docker required)
pnpm test:integration

# Watch mode for integration tests
pnpm test:integration:watch

# Generate coverage report
pnpm test:coverage
```

---

## Test Scripts

| Script | Command | Description |
| --- | --- | --- |
| `pnpm test` | `jest` | Runs all test projects (unit + integration) |
| `pnpm test:unit` | `jest --selectProjects unit` | Runs unit tests only |
| `pnpm test:integration` | `jest --selectProjects integration` | Runs integration tests only |
| `pnpm test:integration:watch` | `jest --selectProjects integration --watch` | Integration tests in watch mode |
| `pnpm test:benchmark` | `jest --selectProjects integration --testPathPattern=benchmark ...` | Projection pipeline latency benchmark (sync vs async) |
| `pnpm test:coverage` | `jest --coverage` | All tests with V8 coverage report |

---

## Architecture

Integration tests boot the **full NestJS application** against real, ephemeral databases managed by [testcontainers](https://node.testcontainers.org/).

### Lifecycle

```
globalSetup (once)
  ├── Start PostgreSQL container (pgvector/pgvector:pg16)
  ├── Create the app_user (NOLOGIN) and app_login (LOGIN, IN ROLE app_user) roles
  ├── Start Redis container (redis:7-alpine)
  └── Write connection config to temp file

Per Jest Worker (parallel)
  ├── jest.setup.ts
  │   ├── Load .env.test
  │   └── Override DB_*/REDIS_* with testcontainer config (the app connects as app_login)
  └── worker-database.setup.ts (called from createTestApp)
      ├── Create worker-specific database (test_w{workerId})
      └── Run pending SQL migrations with the real runner (scripts/migrate.ts): applied ones are
          recorded in schema_migrations, so a worker that runs several test files migrates only once)

Per Test Suite
  ├── beforeAll: createTestApp() → boots full NestJS app
  ├── beforeEach: resetTestState() → truncate tables + flush Redis
  └── afterAll: app.cleanup() → close queues + app

globalTeardown (once)
  ├── Stop PostgreSQL container
  ├── Stop Redis container
  └── Remove temp config file
```

### Worker Isolation

Each Jest worker gets:

- **Its own PostgreSQL database**: `test_w1`, `test_w2`, ... `test_w16`
- **Its own Redis DB index**: 0–15 (one per worker, Redis default of 16 DBs)
- Maximum 16 workers (configured in `jest.config.ts`)

This means tests running in parallel never interfere with each other.

### Rate limiting

`.env.test` sets `TRUST_PROXY_HOPS=1`, so the test app reads client IPs as it does behind the ALB:
the right-most `X-Forwarded-For` entry. `.env.test` also sets `RATE_LIMIT_ENABLED=false`, because suites log in and call the auth routes far more
often than the limits allow. `createTestApp()` applies the same HTTP hardening as `main.ts` (security
headers, body limit, Stripe raw-body capture). A suite that tests the limiter or the login lockout
turns it on with `app.module.get(RateLimitService).enabled = true` (see
`security/rate-limits-and-hardening.integration.spec.ts`).

### Database Roles

The app connects as `app_login`, a `LOGIN` role that inherits `app_user`, the same shape as deployed environments (`scripts/setup-app-user-role.sql`). Row-level security therefore applies to every query the app runs in tests, exactly as in production:

- **`app.appDatabaseService`** is the app's own `DatabaseService` (`app_login`). App code and the RLS suite use it.
- **`app.databaseService`** is a separate superuser connection (`TEST_ADMIN_DATABASE`, `setup/admin-database.ts`) that bypasses RLS. Use it for fixtures, truncation and raw assertions only.

Fixtures written through a repository with no tenant context are rejected by RLS, so pass the superuser's client, as the factories do:

```typescript
await app.databaseService.transaction((client) =>
  app.module.get(DocumentRepository).create(data, { client }),
);
```

If app code returns 0 rows, throws `… has row-level security, so a query without a database context would see no rows` (the `BaseRepository` guard), or hits `new row violates row-level security policy` in a test, check that it runs inside `transactionWithTenantContext` (or the platform-admin or auth-flow context) before changing the test: a query with no context fails the same way in production.

---

## Test Naming Convention

| Pattern | Location | Jest Project | Description |
| --- | --- | --- | --- |
| `*.spec.ts` | `apps/api/src/**/*.spec.ts` | `unit` | Unit tests, co-located with source code |
| `*.integration.spec.ts` | `apps/api/test/**/*.integration.spec.ts` | `integration` | Integration tests, in the test directory |

The `unit` project explicitly excludes `*.integration.spec.ts` files to prevent overlap.

### Which Kind of Test to Write

| Write a unit test (`*.spec.ts`, dependencies mocked) for | Write an integration test (`*.integration.spec.ts`, real Postgres + Redis) for |
| --- | --- |
| Pure business logic in services (no DB calls) | Repository operations (real SQL) |
| Utility functions | Service methods that touch the database |
| DTO validation | RLS policy enforcement |
| Mappers and transformers | Multi-step workflows (create tenant → add user → check permissions) |
| | Queue job dispatch and processing |
| | New factories |

---

## Directory Structure

```
apps/api/test/
├── setup/                          # Test infrastructure (runs before/after tests)
│   ├── global-setup.ts             # Starts Postgres + Redis testcontainers
│   ├── global-teardown.ts          # Stops containers, removes temp config
│   ├── jest.setup.ts               # Per-worker: loads .env.test, overrides env vars
│   ├── worker-database.setup.ts    # Per-worker: creates DB + runs pending migrations (scripts/migrate.ts)
│   ├── migration-runner.integration.spec.ts  # The runner: checksums, atomic bookkeeping, lock
│   ├── test-app.factory.ts         # createTestApp(): boots the app, wires both database connections
│   ├── admin-database.ts           # TEST_ADMIN_DATABASE: superuser DatabaseService for fixtures
│   └── smoke.integration.spec.ts   # Verifies the test infrastructure itself
├── factories/                      # Test data builders
│   ├── index.ts                    # Barrel export
│   ├── tenant.factory.ts           # createTestTenant()
│   ├── user.factory.ts             # createTestUser()
│   ├── subscription.factory.ts     # createTestSubscription()
│   └── factories.integration.spec.ts  # Tests for the factories
├── rls/
│   └── tenant-isolation.integration.spec.ts  # One case per RLS policy, cross-tenant checks, policy meta-test
├── helpers/                        # Shared test utilities
│   ├── test-config.ts              # Testcontainer config path + TypeScript types
│   ├── truncate.helper.ts          # truncateAllTables() — preserves reference data
│   ├── redis-flush.helper.ts       # flushRedis() + resetTestState()
│   ├── tenant-context.helper.ts    # withTenantContext() / withPlatformAdminContext()
│   ├── http-cookie.helper.ts       # cookieHeaderFromSetCookie() — Set-Cookie → Cookie header, like a browser jar
│   └── queue.helper.ts             # waitForQueueIdle() — poll until queue drained
└── mocks/                          # Shared mock implementations
    ├── storage.mock.ts             # MockStorageService (replaces S3)
    └── file-type.mock.ts           # file-type ESM compatibility mock
```

---

## Writing Integration Tests

### Basic Template

```typescript
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

describe('YourFeature', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  it('should do something', async () => {
    const result = await app.databaseService.query('SELECT 1 as ok', []);
    expect(result.rows[0]?.ok).toBe(1);
  });
});
```

### Using Factories

```typescript
import { createTestTenant, createTestUser, createTestSubscription } from '../factories';

it('should create a user with tenant', async () => {
  const tenant = await createTestTenant(app.module);
  const subscription = await createTestSubscription(app.module, tenant.id);
  const user = await createTestUser(app.module, { tenant_id: tenant.id });

  expect(user.tenant_id).toBe(tenant.id);
});
```

### Testing with Tenant RLS Context

```typescript
import { withTenantContext } from '../helpers/tenant-context.helper';

it('should respect RLS policies', async () => {
  const tenant = await createTestTenant(app.module);

  const rows = await withTenantContext(
    app.databaseService,
    tenant.id,
    async (client) => {
      const result = await client.query('SELECT * FROM some_table');
      return result.rows;
    },
  );

  expect(rows).toHaveLength(0);
});
```

### Tenant Isolation (RLS) Suite

`rls/tenant-isolation.integration.spec.ts` proves every RLS policy is enforced for the app role:

- **One case per policy** (`POLICY_CASES`): the operation the policy allows, in the context it allows it (tenant, tenant admin, platform admin or auth flow). Each case runs through `appDatabaseService` and must succeed.
- **Cross-tenant checks**, one per tenant-scoped table: as tenant A's admin, tenant B's row can't be read, updated, deleted, or inserted for B. With no context, nothing is visible.
- **Real repositories and routes:** `DocumentRepository.findById` and `GET /api/v1/documents/:id` don't return tenant B's document to tenant A.
- **Meta-test:** for every row in `pg_policies`, it drops the policy inside a rolled-back transaction and checks that the policy's case then fails. It also fails when a policy has no case, or a case names a policy that no longer exists.

**When you add or change an RLS policy,** add or update its entry in `POLICY_CASES`. When `app_user` lacks the privilege for a policy's command (for example there is no `DELETE` on `documents`, which are soft-deleted), mark the case `blockedByGrant` with the reason; the suite then asserts the privilege error, and fails if the privilege is granted later so the case gets a real operation. A new tenant-scoped table also needs a fixture row in `seedWorld()` and entries in `TENANT_TABLES` and `INSERT_FOR`.

### Overriding Providers

```typescript
const app = await createTestApp({
  providers: [
    { provide: SomeService, useValue: { myMethod: jest.fn() } },
  ],
});
```

### Important Timeouts

| Hook | Timeout | Reason |
| --- | --- | --- |
| `beforeAll` (createTestApp) | 60s | First call creates the worker DB, runs migrations, and boots NestJS |
| `beforeEach` (resetTestState) | 15s | Truncates all tables + flushes Redis |
| `afterAll` (cleanup) | 30s | Closes queues and the NestJS app |

---

## Test Utilities Reference

### `createTestApp(options?): Promise<TestApp>`

Boots the full NestJS application with real database and Redis connections. Returns:

| Property | Type | Description |
| --- | --- | --- |
| `app` | `INestApplication` | The NestJS app instance |
| `module` | `TestingModule` | The testing module (use `.get()` to resolve providers) |
| `databaseService` | `DatabaseService` | Superuser connection that bypasses RLS: fixtures, truncation and raw assertions only |
| `appDatabaseService` | `DatabaseService` | The app's own connection (`app_login`), subject to RLS |
| `redisService` | `RedisService` | Redis service |
| `redisClient` | `Redis` | Raw ioredis client |
| `queueProducerService` | `QueueProducerService` | BullMQ queue producer |
| `cleanup` | `() => Promise<void>` | Closes queues + app — call in `afterAll` |

Automatically mocks `StorageService` and `AuditService`. Registers `@fastify/cookie` and `@fastify/multipart` as `main.ts` does, so upload routes can be called with a `multipart/form-data` payload (`templates/templates-api.integration.spec.ts` builds one by hand). To see what a route stored, override `StorageService` with a subclass of `MockStorageService` that records it.

### `resetTestState(databaseService, redisClient, options?)`

Truncates all transactional tables (preserves reference data like plans, roles, permissions) and flushes the worker's Redis DB. Call in `beforeEach`.

### `truncateAllTables(databaseService, options?)`

Truncates transactional tables only. Preserves reference tables populated by sync services on app boot:
`plans`, `features`, `plan_entitlements`, `tenant_roles`, `tenant_permissions`, `tenant_role_permissions`, `platform_roles`, `platform_permissions`, `platform_role_permissions`, plus `schema_migrations`.

`TRUNCATE … CASCADE` would also empty `tenant_roles` (it has a foreign key to `tenants`) and, through it, `tenant_role_permissions`. So the helper runs in one transaction: it keeps the system roles (`tenant_id IS NULL`) and their permissions, truncates, and restores them. Tenant custom roles are cleared like other tenant data. Tests don't need to re-run `TenantRbacSyncService`.

### `cookieHeaderFromSetCookie(headers)`

Turns `Set-Cookie` response headers into a `Cookie` request header the way a browser would. When the same cookie is set more than once (e.g. merging login and tenant-switch headers), the later value wins, and a cleared cookie (empty value, `Max-Age=0`, or an `Expires` in the past) is dropped rather than sent empty.

### `withTenantContext(databaseService, tenantId, callback, options?)`

Executes a callback inside a transaction with RLS tenant context set (`SET LOCAL ROLE app_user` + `app.tenant_id`). Pass `app.databaseService`: the superuser can switch to `app_user`. Options: `isTenantAdmin`, `allowCrossTenantRead`.

### `withPlatformAdminContext(databaseService, callback)`

Executes a callback inside a transaction with platform admin RLS context.

### `waitForQueueIdle(queue, timeout?)`

Polls until all active/waiting/delayed jobs on the given BullMQ queue are drained. Use in integration tests that enqueue async jobs and need to assert post-processing state without arbitrary sleeps. Default timeout: 10s.

```typescript
import { waitForQueueIdle } from '../helpers/queue.helper';
import { getQueueToken, QUEUE_NAMES } from '@lib/queue';

const queue = app.module.get<Queue>(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING));
await waitForQueueIdle(queue, 15000);
```

### Testing worker code

A worker has no test app of its own. To run its service against the real schema, construct it in an API integration test with its repositories on `app.appDatabaseService` (the workers connect as the app role) and fake only what leaves the process (S3, Gotenberg, LLMs). `documents/document-generation.integration.spec.ts` does this for the generation worker: the API's `generate()` creates the job and the worker processes the payload the API queued. Import worker files by relative path (`../../../worker-generation/src/...`); a `@lib/*` library they use must be mapped in the integration project's `moduleNameMapper` in `jest.config.ts`.

### Factories

| Factory | Function | Description |
| --- | --- | --- |
| `tenant.factory.ts` | `createTestTenant(module, overrides?)` | Creates a tenant with random slug |
| `user.factory.ts` | `createTestUser(module, overrides?)` | Creates a user (requires tenant) |
| `subscription.factory.ts` | `createTestSubscription(module, tenantId, overrides?)` | Creates a subscription for a tenant |

#### Adding a Factory

1. Create `apps/api/test/factories/{entity}.factory.ts` exporting `createTest{Entity}(module, overrides?)`.
2. Build the row through the entity's real repository (`module.get(EntityRepository)`), not raw SQL, so the factory breaks when the repository contract changes.
3. Export it from `apps/api/test/factories/index.ts`.
4. Cover it in `factories.integration.spec.ts`.
5. Add it to the table above and to the directory trees here and in `CONTRIBUTING.md`.

### Keeping This README Current

Update this file when you add or change shared test infrastructure: a factory, helper, mock or setup file, or the container lifecycle. For lifecycle changes, also update the CI section of `apps/api/docs/DEVELOPMENT.md`. Adding an ordinary test file needs no doc change.

---

## CI Requirements

### Docker

Testcontainers **requires Docker**. Any CI runner must have a Docker daemon accessible.

- **Minimum Docker version:** 20.10+
- **Recommended:** Docker 24.x+
- GitHub Actions `ubuntu-latest` runners include Docker — works out of the box
- Self-hosted runners need Docker installed with socket access for the runner user

### No Secrets Needed

- `.env.test` is committed, so all test env vars are checked in, including placeholder Stripe keys. A fresh clone with Docker runs `pnpm test` with no extra variables.
- The test app never reads a developer's `apps/api/.env`: `configModuleOptions` sets `ignoreEnvFile` when `NODE_ENV=test`.
- Database and Redis connection details are overridden at runtime by testcontainers.
- JWT secrets, S3 keys in `.env.test` are hardcoded test values (not real credentials).

### GitHub Actions

`.github/workflows/ci.yml` runs on every pull request to `development` or `main`, and as the first job of `deploy-staging.yml`, so a red suite blocks the deploy. It has two jobs:

- **Lint, type-check, unit tests:** `pnpm lint:ci` (ESLint with `--max-warnings=0`, no `--fix`), `pnpm type-check`, `pnpm test:unit --ci`.
- **Integration tests:** `pnpm test:integration --ci` against Testcontainers on the runner's Docker.

To make it block merges, mark both jobs as required status checks in the branch protection of `development` and `main`.

---

## Troubleshooting

### "Test config not found" Error

```
Test config not found at /tmp/complytude-test-config.json. Did globalSetup complete successfully? Ensure Docker is running.
```

**Cause:** Docker is not running or `globalSetup` failed to start testcontainers.

**Fix:** Start Docker Desktop (or `dockerd`) and retry.

### Tests Hang or Timeout

- Check Docker is responsive: `docker ps`
- Ensure no stale testcontainers: `docker ps -a | grep testcontainers`
- Kill orphaned containers: `docker rm -f $(docker ps -aq --filter label=org.testcontainers)`

### "Jest worker out of range" Error

```
Jest worker X → Redis DB Y out of range (0-15). Ensure integration maxWorkers ≤ 16.
```

**Cause:** More than 16 Jest workers spawned.

**Fix:** The jest config caps `maxWorkers: 16`. Don't override this with `--maxWorkers` > 16.

### Slow First Run

The first integration test run downloads Docker images (`pgvector/pgvector:pg16`, `redis:7-alpine`). Subsequent runs use cached images and are significantly faster.

### `JEST_SKIP_INTEGRATION_BOOTSTRAP`

Set `JEST_SKIP_INTEGRATION_BOOTSTRAP=1` to skip global setup/teardown. Useful when running unit tests only or debugging jest config issues.

---

## Related Documentation

- [CONTRIBUTING.md](../../../CONTRIBUTING.md) — Commit standards, PR process
- [apps/api/docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) — CI requirements, module creation
- [jest.config.ts](../../../jest.config.ts) — Jest project configuration
- [scripts/README.md](../../../scripts/README.md) — Database migration scripts

---

[Back to API Documentation](../docs/DEVELOPMENT.md) | [Back to Contributing Guide](../../../CONTRIBUTING.md)

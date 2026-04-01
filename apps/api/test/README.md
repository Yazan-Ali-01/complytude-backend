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
  ├── Create app_user role
  ├── Start Redis container (redis:7-alpine)
  └── Write connection config to temp file

Per Jest Worker (parallel)
  ├── jest.setup.ts
  │   ├── Load .env.test
  │   └── Override DB_*/REDIS_* with testcontainer config
  └── worker-database.setup.ts (called from createTestApp)
      ├── Create worker-specific database (test_w{workerId})
      └── Run all SQL migrations

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

---

## Test Naming Convention

| Pattern | Location | Jest Project | Description |
| --- | --- | --- | --- |
| `*.spec.ts` | `apps/api/src/**/*.spec.ts` | `unit` | Unit tests, co-located with source code |
| `*.integration.spec.ts` | `apps/api/test/**/*.integration.spec.ts` | `integration` | Integration tests, in the test directory |

The `unit` project explicitly excludes `*.integration.spec.ts` files to prevent overlap.

---

## Directory Structure

```
apps/api/test/
├── setup/                          # Test infrastructure (runs before/after tests)
│   ├── global-setup.ts             # Starts Postgres + Redis testcontainers
│   ├── global-teardown.ts          # Stops containers, removes temp config
│   ├── jest.setup.ts               # Per-worker: loads .env.test, overrides env vars
│   ├── worker-database.setup.ts    # Per-worker: creates DB + runs migrations
│   └── smoke.integration.spec.ts   # Verifies the test infrastructure itself
├── factories/                      # Test data builders
│   ├── index.ts                    # Barrel export
│   ├── tenant.factory.ts           # createTestTenant()
│   ├── user.factory.ts             # createTestUser()
│   ├── subscription.factory.ts     # createTestSubscription()
│   └── factories.integration.spec.ts  # Tests for the factories
├── helpers/                        # Shared test utilities
│   ├── test-config.ts              # Testcontainer config path + TypeScript types
│   ├── truncate.helper.ts          # truncateAllTables() — preserves reference data
│   ├── redis-flush.helper.ts       # flushRedis() + resetTestState()
│   ├── tenant-context.helper.ts    # withTenantContext() / withPlatformAdminContext()
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
| `databaseService` | `DatabaseService` | Direct database access |
| `redisService` | `RedisService` | Redis service |
| `redisClient` | `Redis` | Raw ioredis client |
| `queueProducerService` | `QueueProducerService` | BullMQ queue producer |
| `cleanup` | `() => Promise<void>` | Closes queues + app — call in `afterAll` |

Automatically mocks `StorageService` and `AuditService`.

### `resetTestState(databaseService, redisClient, options?)`

Truncates all transactional tables (preserves reference data like plans, roles, permissions) and flushes the worker's Redis DB. Call in `beforeEach`.

### `truncateAllTables(databaseService, options?)`

Truncates transactional tables only. Preserves reference tables populated by sync services on app boot:
`plans`, `features`, `plan_entitlements`, `tenant_roles`, `tenant_permissions`, `tenant_role_permissions`, `platform_roles`, `platform_permissions`, `platform_role_permissions`.

### `withTenantContext(databaseService, tenantId, callback, options?)`

Executes a callback inside a transaction with RLS tenant context set (`SET LOCAL ROLE app_user` + `app.tenant_id`). Options: `isTenantAdmin`, `allowCrossTenantRead`.

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

### Factories

| Factory | Function | Description |
| --- | --- | --- |
| `tenant.factory.ts` | `createTestTenant(module, overrides?)` | Creates a tenant with random slug |
| `user.factory.ts` | `createTestUser(module, overrides?)` | Creates a user (requires tenant) |
| `subscription.factory.ts` | `createTestSubscription(module, tenantId, overrides?)` | Creates a subscription for a tenant |

---

## CI Requirements

### Docker

Testcontainers **requires Docker**. Any CI runner must have a Docker daemon accessible.

- **Minimum Docker version:** 20.10+
- **Recommended:** Docker 24.x+
- GitHub Actions `ubuntu-latest` runners include Docker — works out of the box
- Self-hosted runners need Docker installed with socket access for the runner user

### No Secrets Needed

- `.env.test` is committed — all test env vars are checked in
- Database and Redis connection details are overridden at runtime by testcontainers
- JWT secrets, S3 keys in `.env.test` are hardcoded test values (not real credentials)

### Example GitHub Actions Workflow

Reference snippet (not yet implemented):

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

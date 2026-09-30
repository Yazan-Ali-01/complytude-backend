# Contributing to Complytude

Thank you for your interest in contributing to Complytude! This guide will help you get started with our monorepo development workflow, commit standards, and contribution process.

> **⚠️ PRE-PRODUCTION STATUS:** This project is currently in pre-production. We prioritize rapid iteration over backward compatibility. See [Pre-Production Guidelines](#pre-production-guidelines) for details on migrations and breaking changes.

## Table of Contents

- [Pre-Production Guidelines](#pre-production-guidelines)
- [Development Setup](#development-setup)
- [Git Hooks](#git-hooks)
- [Commit Message Standards](#commit-message-standards)
- [Pull Request Process](#pull-request-process)
- [Code Quality Requirements](#code-quality-requirements)
- [Testing](#testing)

---

## Pre-Production Guidelines

**Project Status:** PRE-PRODUCTION

This project is in active development and has not yet been deployed to production. This means:

### Database Migrations

Migrations are append-only, pre-production included: a shared database (staging) runs them, and
an edited file would never reach it.

1. **Add a new numbered file** in `scripts/migrations/` for every schema change (`028_...sql`,
   `029_...sql`). Never edit, rename or delete an existing one: `pnpm db:migrate` refuses to run
   when an applied file's checksum changed, and CI fails a PR that modifies one.
2. Keep the file's shape: one `BEGIN;` and one `COMMIT;` around the statements, and a commented
   rollback block. The runner applies the file and its `schema_migrations` row in one transaction.
3. Prefer backward-compatible changes (add first, remove in a later release): migrations run while
   the previous version is still serving.
4. A local database built from older files is reset with `pnpm services:reset`.

### Breaking Changes

**No backward compatibility required:**

- Make breaking API changes freely
- Refactor code aggressively without deprecation periods
- Remove old code immediately
- Update documentation to reflect current state only

**When making breaking changes:**

1. Make the change directly
2. Update all references in one go
3. Update documentation and tests
4. Communicate changes to team members

### Code Refactoring

- Rename things for clarity without keeping old names
- Change interfaces without maintaining old versions
- Remove dead code immediately
- No need for compatibility layers or deprecation warnings

### Leaving Pre-Production

These relaxations end at the **first production deployment** (real users, real data, or an external integration depending on the API). From then on:

1. **Migrations are already append-only** (see Database Migrations); nothing changes there.
2. **Keep the API backward compatible.** Deprecate before removing; version the API when a break is unavoidable.
3. **Provide migration paths** for data and clients affected by a change.
4. **Write upgrade notes** for breaking changes.
5. **Roll out risky changes behind feature flags.**

---

## Development Setup

### Prerequisites

Before contributing, ensure you have:

- Node.js >= 22.16.0
- pnpm >= 9.x
- Docker >= 24.x with Docker Compose
- Git

For Windows users: Configure pnpm to use Git Bash (see [main README](README.md#windows-users))

### Complete Setup Instructions

See the [Quick Start](README.md#quick-start) section in the main README for detailed setup instructions.

### Quick Reference

```bash
# First-time setup (run once)
git clone <repository-url>
cd complytude
pnpm install
cp apps/api/.env.example apps/api/.env  # Configure API environment
pnpm project:setup              # Starts PostgreSQL + Redis, runs migrations
pnpm db:seed                    # (Optional) Seed test data for development

# Daily development
pnpm dev                # Auto-starts services + API development server
# Or start specific apps:
pnpm start:api          # Start API only
pnpm start:worker-ai    # Start AI worker
pnpm start:worker-ingestion  # Start ingestion worker

# Before committing
pnpm lint
pnpm type-check
```

**📚 Complete Script Reference:** See [scripts/README.md](scripts/README.md) for detailed documentation of all available scripts, including Docker commands, database utilities, and debugging tools.

### Verify Your Setup

After setup, verify everything works:

```bash
# Check services are running
docker ps

# Should see:
# - complytude-postgres (port 5432)
# - complytude-redis (port 6379)

# Test API
curl http://localhost:3000/api/health
```

---

## Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) to enforce code quality and commit message standards through automated Git hooks.

### Pre-Commit Hook

**Runs automatically before every commit**

The pre-commit hook ensures code quality by running:

1. **Type Checking** (`pnpm type-check`)
   - Validates TypeScript types across the entire project
   - Catches type errors before they reach the repository

2. **Lint-Staged** (`pnpm lint-staged`)
   - Runs ESLint on staged files only
   - Automatically fixes issues when possible
   - Ensures consistent code style

**What happens when you commit:**

```bash
git add .
git commit -m "your message"

# Husky runs automatically:
# ✓ Type checking...
# ✓ Linting staged files...
# ✓ Auto-fixing issues...
# → Commit succeeds if all checks pass
```

**If checks fail:**

```bash
# Fix the reported issues
pnpm lint           # Fix linting issues
pnpm type-check     # Check type errors

# Then try committing again
git add .
git commit -m "your message"
```

### Commit Message Hook

**Enforces conventional commit format**

The commit-msg hook validates your commit messages using [Commitlint](https://commitlint.js.org/) to ensure consistency and clarity.

---

## Commit Message Standards

### Required Format

```
type(scope): short description (issue-key)

- Bullet point changes
- Another change

Closes issue-key
```

### Example

```
feat(templates): implement DOCX generation service (COM-4)

- Add Document Generation Service
- Integrate docxtemplater
- Add variable validation
- Write unit tests

Closes COM-4
```

### Commit Types

| Type       | Description                                               |
| ---------- | --------------------------------------------------------- |
| `feat`     | New feature                                               |
| `fix`      | Bug fix                                                   |
| `refactor` | Code refactoring (no functional changes)                  |
| `test`     | Adding or updating tests                                  |
| `docs`     | Documentation changes                                     |
| `chore`    | Build process, dependencies, tooling, project maintenance |

### Commit Scope

- Short descriptor of the affected module/area
- Examples: `auth`, `templates`, `storage`, `tenant`, `database`

### Commit Description

- Brief summary of the change
- Use imperative mood ("add" not "added")
- Don't end with a period
- Max length: 100 characters for the entire header line

### Body (Optional)

- Bullet points explaining what changed
- Leave a blank line after the header
- Use present tense

### Footer (Optional)

- References to issue tracker
- `Closes COM-123` or `Fixes COM-456`
- Leave a blank line before footer
- Used when this commit/PR completes the Linear issue

### More Examples

**Feature addition:**

```
feat(auth): add email verification flow (COM-15)

- Create email verification endpoint
- Add email service integration
- Update user schema with verification status

Closes COM-15
```

**Bug fix:**

```
fix(storage): resolve file upload timeout issue (COM-28)

- Increase upload timeout to 60 seconds
- Add retry logic for S3 operations
- Improve error messages

Fixes COM-28
```

**Refactoring:**

```
refactor(database): optimize tenant isolation queries (COM-42)

- Use prepared statements for tenant queries
- Cache tenant schema names
- Reduce database round trips

Closes COM-42
```

**Documentation:**

```
docs(readme): update deployment instructions (COM-55)

- Add Docker deployment section
- Update environment variables table
- Fix broken links

Closes COM-55
```

**Testing:**

```
test(templates): add integration tests for DOCX generation (COM-33)

- Test variable substitution
- Test nested loops
- Test error handling
- Add test fixtures

Closes COM-33
```

### Validation Errors

If your commit message doesn't follow the format, you'll see:

```bash
❌ Commit message validation failed!
📖 Please read the Contributing guide for examples
   Example: feat(auth): add login validation (COM-123)
```

**Common issues:**

| Error                                                                    | Cause                   | Solution                                         |
| ------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------ |
| `type must be one of [...]`                                              | Invalid type used       | Use only: feat, fix, refactor, test, docs, chore |
| `scope may not be empty`                                                 | Missing scope           | Add scope: `feat(auth): ...`                     |
| `header must not be longer than 100 characters`                          | Header too long         | Shorten description or move details to body      |
| `subject must not be sentence-case, start-case, pascal-case, upper-case` | Subject uses wrong case | Use lowercase: `add feature` not `Add Feature`   |

### Tips

✅ **DO:**

- Keep the header concise and descriptive
- Use bullet points in the body for multiple changes
- Reference issue numbers
- Write in imperative mood ("add" not "added")

❌ **DON'T:**

- Use vague descriptions like "fix stuff" or "update code"
- Skip the scope
- Exceed 100 characters in the header
- Use past tense ("added feature")

### Bypassing Hooks (Not Recommended)

In emergency situations only:

```bash
# Skip pre-commit hook
git commit --no-verify -m "your message"

# Skip both hooks
HUSKY=0 git commit -m "your message"
```

⚠️ **Warning**: Bypassing hooks should only be done in exceptional circumstances and will likely cause CI/CD pipeline failures.

---

## Pull Request Process

1. **Fork the repository** (if external contributor)

2. **Create a feature branch** from `development`:

   ```bash
   git checkout -b feature/your-feature
   ```

3. **Make your changes** following our coding standards

4. **Write tests** for your changes

5. **Verify your changes** (lint, type-check)

6. **Commit your changes** following the [commit standards](#commit-message-standards)

7. **Push to your branch**:

   ```bash
   git push origin feature/your-feature
   ```

8. **Open a Pull Request** against the `development` branch

### PR Guidelines

- Provide a clear description of the changes
- Reference related issues
- Ensure all CI checks pass (`.github/workflows/ci.yml`: `pnpm audit --prod --audit-level=high`, lint without `--fix`, type-check, unit and integration tests). A new high or critical advisory in a production dependency fails CI; Dependabot (`.github/dependabot.yml`) opens weekly update PRs against `development`
- Request review from maintainers
- Address review feedback promptly

---

## Code Quality Requirements

### Linting & Formatting

```bash
pnpm lint            # Run ESLint (auto-fix)
pnpm format          # Format code with Prettier
```

### Type Checking

```bash
pnpm type-check      # Validate TypeScript types
pnpm build           # Full build with type checking
```

### Standards

- ✅ No TypeScript `any` types (unless absolutely necessary)
- ✅ All inputs validated with `class-validator` DTOs
- ✅ Controllers handle HTTP only - no business logic
- ✅ Services contain business logic
- ✅ Use dependency injection - never instantiate services manually
- ✅ Follow naming conventions: `*.controller.ts`, `*.service.ts`, `*.dto.ts`
- ✅ Add Swagger decorators for API documentation
- ✅ Keep module boundaries clear - avoid circular imports

For detailed development guidelines, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Testing

### Running Tests

```bash
pnpm test                     # Run all tests (unit + integration)
pnpm test:unit                # Run unit tests only
pnpm test:integration         # Run integration tests only
pnpm test:integration:watch   # Run integration tests in watch mode
pnpm test:coverage            # Generate coverage report
```

### Prerequisites for Integration Tests

Integration tests use [testcontainers](https://node.testcontainers.org/) to spin up real Postgres and Redis instances. **Docker must be running** before you execute integration tests.

```bash
# Verify Docker is available
docker info

# Run integration tests (Docker containers start automatically)
pnpm test:integration
```

No manual `docker-compose up` is needed — testcontainers manages container lifecycle automatically.

### Test Naming Convention

| Convention | Location | Example |
| --- | --- | --- |
| `*.spec.ts` | `apps/api/src/**/*.spec.ts` | Unit tests, co-located with source |
| `*.integration.spec.ts` | `apps/api/test/**/*.integration.spec.ts` | Integration tests, in test directory |
| `*.eval.ts` | `apps/api/test/eval/*.eval.ts` | The AI evaluation (`pnpm eval:ai`), not part of the test runs |

Jest uses two project configurations to separate them:

- **`unit`** project: matches `src/**/*.spec.ts`, excludes `*.integration.spec.ts`
- **`integration`** project: matches `**/*.integration.spec.ts` anywhere under `apps/api/`

### Test Directory Structure

```
apps/api/test/
├── eval/                           # pnpm eval:ai: the AI evaluation runner and fake providers
├── setup/                          # Test infrastructure
│   ├── global-setup.ts             # Starts Postgres + Redis testcontainers (runs once)
│   ├── global-teardown.ts          # Stops containers, cleans temp files (runs once)
│   ├── jest.setup.ts               # Per-worker env setup (loads .env.test, overrides DB/Redis config)
│   ├── worker-database.setup.ts    # Creates per-worker database + runs migrations
│   ├── test-app.factory.ts         # createTestApp(): boots the app (as app_login, so RLS applies)
│   ├── admin-database.ts           # Superuser DatabaseService for fixtures and truncation
│   └── smoke.integration.spec.ts   # Verifies test infrastructure works
├── factories/                      # Test data builders
│   ├── index.ts                    # Barrel export
│   ├── tenant.factory.ts           # Creates test tenants
│   ├── user.factory.ts             # Creates test users
│   ├── subscription.factory.ts     # Creates test subscriptions
│   └── factories.integration.spec.ts  # Tests for the factories themselves
├── rls/
│   └── tenant-isolation.integration.spec.ts  # Every RLS policy tested and proven load-bearing
├── helpers/                        # Shared test utilities
│   ├── test-config.ts              # Testcontainer config path + types
│   ├── truncate.helper.ts          # Truncates transactional tables (preserves reference data)
│   ├── redis-flush.helper.ts       # Flushes Redis DB + resetTestState()
│   └── tenant-context.helper.ts    # withTenantContext() / withPlatformAdminContext()
└── mocks/                          # Shared mocks
    ├── storage.mock.ts             # MockStorageService (S3)
    └── file-type.mock.ts           # file-type ESM compatibility mock
```

### Writing Integration Tests

Integration tests boot the full NestJS app against real databases. Use `createTestApp()` and `resetTestState()`:

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
    // Use app.databaseService, app.module, app.redisClient, etc.
  });
});
```

For comprehensive testing documentation, see [apps/api/test/README.md](apps/api/test/README.md).

---

## AI Coding Assistants

Instructions for AI coding assistants live in [`CLAUDE.md`](CLAUDE.md): commands, architecture, conventions, and which docs to update after a change. When a change establishes or alters a convention that applies across 3+ files, update `CLAUDE.md` in the same pull request.
---

## Related Documentation

- [Main README](README.md) - Project overview and quick start
- [docs/README.md](docs/README.md) - Documentation hub
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [apps/api/docs/DEVELOPMENT.md](apps/api/docs/DEVELOPMENT.md) - API development workflow
- [apps/api/docs/API_CONTRACTS.md](apps/api/docs/API_CONTRACTS.md) - API contract standards
- [scripts/README.md](scripts/README.md) - Complete script reference
- [apps/api/test/README.md](apps/api/test/README.md) - Testing documentation

---

## Questions?

If you have questions about contributing, please:

1. Check the [main README](README.md) for project overview
2. Review the [documentation](docs/README.md)
3. Open an issue for discussion

Thank you for contributing! 🙏

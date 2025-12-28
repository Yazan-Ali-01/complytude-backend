# Script Reference Guide

Complete reference for all available pnpm scripts in Complytude.

---

## Table of Contents

- [Quick Commands](#quick-commands)
- [Testing Scripts](#testing-scripts)
- [Docker Services](#docker-services)
- [Database Scripts](#database-scripts)
- [Code Quality](#code-quality)
- [Advanced/Debug Scripts](#advanceddebug-scripts)

---

## Quick Commands

Essential commands for daily development:

```bash
pnpm project:setup          # First-time setup (start services, run migrations, verify)
pnpm dev            # Start development (auto-starts services if needed)
pnpm build          # Build for production
pnpm start:prod     # Run production build
```

### Details

**`pnpm project:setup`**

- Runs the complete first-time setup process
- Starts PostgreSQL and MinIO services
- Waits for services to be healthy
- Runs all database migrations
- Verifies the setup

**`pnpm dev`**

- Smart development command
- Checks if Docker services are running
- Starts services automatically if needed
- Starts the development server with hot-reload
- **Use this for daily development**

**`pnpm build`**

- Compiles TypeScript to JavaScript
- Outputs to `dist/` directory
- Includes type checking
- Required before production deployment

**`pnpm start:prod`**

- Runs the compiled production build
- Requires `pnpm build` to be run first
- Uses optimized settings for production

---

## Testing Scripts

### Run All Tests

```bash
pnpm test           # Run unit tests
pnpm test:e2e       # Run all E2E tests
pnpm test:cov       # Run tests with coverage
```

### Test Specific Features

```bash
pnpm test:e2e:auth        # Authentication & JWT
pnpm test:e2e:tenant      # Multi-tenancy & organizations
pnpm test:e2e:storage     # File uploads (MinIO/S3)
pnpm test:e2e:templates   # Document templates
pnpm test:e2e:features    # Plan-based features
```

### Advanced Testing

```bash
pnpm test:watch           # Run unit tests in watch mode
pnpm test:debug           # Run tests with debugger
pnpm test:e2e:watch       # Run E2E tests in watch mode
pnpm test:e2e:debug       # Debug E2E tests
pnpm test:e2e:coverage    # E2E tests with coverage
pnpm test:swagger         # Validate Swagger schema
```

### Test Infrastructure

```bash
pnpm test:db:setup        # Setup separate test database
pnpm test:db:reset        # Reset test database
```

### When to Use

- **`test:watch`** - When doing TDD or rapid iteration on unit tests
- **`test:debug`** / **`test:e2e:debug`** - When debugging with breakpoints
- **`test:e2e:*`** - Feature-specific tests run faster than full E2E suite
- **`test:swagger`** - When validating API contract changes
- **`test:db:*`** - When setting up CI/CD pipelines or troubleshooting test database

For detailed testing documentation, see [test/README.md](../test/README.md).

---

## Docker Services

### Common Commands

```bash
pnpm docker:start   # Start PostgreSQL + MinIO (smart health checks)
pnpm docker:up:all  # Start all services including pgAdmin
pnpm docker:stop    # Stop all services (keeps data)
pnpm docker:logs    # View service logs
pnpm docker:reset   # ⚠️ Reset everything (deletes all data)
```

### Service Access

After starting services:

- **PostgreSQL**: `localhost:5432`
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **pgAdmin**: http://localhost:5050 (only with `docker:up:all`)

### Details

**`pnpm docker:start`** (Recommended)

- Starts PostgreSQL + MinIO
- Runs health checks before returning
- Waits for services to be fully ready
- **Use this for reliable service startup**

**`pnpm docker:up:all`**

- Starts all services including pgAdmin
- Uses Docker Compose profiles
- Includes optional database management tools

**`pnpm docker:stop`**

- Stops containers gracefully
- **Preserves all data** (volumes remain)
- Safe to use between development sessions

**`pnpm docker:logs`**

- Shows live logs from all services
- Press `Ctrl+C` to exit
- Useful for debugging service issues

**`pnpm docker:reset`** ⚠️

- **Destructive operation**
- Stops and removes all containers
- **Deletes all volumes and data**
- Automatically restarts services after cleanup
- Use when you need a completely fresh start

### Troubleshooting

**Services not responding?**

```bash
pnpm docker:logs      # Check for errors
pnpm docker:stop
pnpm docker:start
```

**Need completely fresh start?**

```bash
pnpm docker:reset     # ⚠️ Deletes all data
pnpm db:migrate       # Re-run migrations
```

---

## Docker - Full Stack

Commands for running the entire application stack (including NestJS) in Docker containers.

### When to Use Full Stack Mode

Use fully dockerized mode when:

- Testing deployment configurations
- Running CI/CD pipelines
- Onboarding developers (no local Node.js setup needed)
- Debugging Docker-specific issues
- Simulating production environment

**For active development**, use hybrid mode (`pnpm dev`) instead for faster hot-reload.

### Common Commands

```bash
pnpm docker:build       # Build NestJS Docker image (production)
pnpm docker:build:dev   # Build with dev dependencies
pnpm docker:up:full     # Start everything (Postgres + MinIO + NestJS)
pnpm docker:down:full   # Stop full stack (keeps data)
pnpm docker:logs:app    # View NestJS app logs only
pnpm docker:logs:full   # View logs from all services
```

### Details

**`pnpm docker:build`** (Production Build)

- Builds optimized Docker image for the NestJS application
- Uses multi-stage Dockerfile for minimal image size (~150MB)
- Includes only production dependencies
- Non-root user for security
- Built-in health checks

**Usage:**

```bash
# Build production image
pnpm docker:build

# Verify image was created
docker images | grep complytude-api
```

**`pnpm docker:build:dev`** (Development Build)

- Builds image with development dependencies
- Larger image size (~300MB) but includes TypeScript and dev tools
- Useful for testing builds without production optimizations

**`pnpm docker:up:full`**

- Starts complete application stack in Docker
- Includes: PostgreSQL, MinIO, and NestJS app
- Uses Docker Compose profiles (`--profile full-stack`)
- Waits for health checks before starting app

**Usage:**

```bash
# Start everything
pnpm docker:up:full

# Access the application
curl http://localhost:3000/api/health

# View Swagger docs
open http://localhost:3000/docs
```

**Environment Configuration:**

When using full-stack mode, the app uses Docker service names for inter-container communication:

- `DB_HOST=postgres` (not `localhost`)
- `S3_ENDPOINT=http://minio:9000` (not `http://localhost:9000`)

These are automatically configured in `docker-compose.yml`.

**`pnpm docker:down:full`**

- Stops all containers in the full stack
- **Preserves data** (volumes remain intact)
- Safe to use between development sessions

**`pnpm docker:logs:app`**

- Shows logs from the NestJS application container only
- Real-time log streaming
- Press `Ctrl+C` to exit

**Usage:**

```bash
# View app logs
pnpm docker:logs:app

# View last 100 lines
docker-compose logs --tail=100 app

# Follow logs
docker-compose logs -f app
```

**`pnpm docker:logs:full`**

- Shows logs from all services (Postgres, MinIO, NestJS)
- Useful for debugging inter-service communication
- Color-coded by service

### Workflows

#### Testing Deployment Before Production

```bash
# 1. Build production image
pnpm docker:build

# 2. Start everything
pnpm docker:up:full

# 3. Run migrations (if needed)
docker-compose exec app pnpm db:migrate

# 4. Run tests
docker-compose exec app pnpm test:e2e

# 5. Check health
curl http://localhost:3000/api/health

# 6. Clean up
pnpm docker:down:full
```

#### CI/CD Pipeline

```bash
# In your CI/CD script
pnpm docker:build
pnpm docker:up:full
docker-compose exec -T app pnpm test:e2e
pnpm docker:down:full
```

#### Switching Between Hybrid and Full Stack

**From Hybrid to Full Stack:**

```bash
# Stop local dev server (Ctrl+C)

# Build and start full stack
pnpm docker:build
pnpm docker:up:full

# App available at http://localhost:3000
```

**From Full Stack to Hybrid:**

```bash
# Stop full stack
pnpm docker:down:full

# Start hybrid mode (services only + local NestJS)
pnpm dev
```

### Troubleshooting

**Image build fails?**

```bash
# Check Docker has enough resources (RAM, disk space)
docker system df

# Clean up old images
docker system prune -a

# Rebuild without cache
docker build --no-cache -t complytude-api:latest .
```

**App container won't start?**

```bash
# View detailed logs
pnpm docker:logs:app

# Common issues:
# 1. Port 3000 already in use - change PORT in .env
# 2. Database not ready - wait 30s for health checks
# 3. Environment variables missing - check .env file

# Check container status
docker ps -a | grep complytude

# Inspect container
docker inspect complytude-app
```

**Code changes not reflected?**

```bash
# Full stack mode requires rebuild
pnpm docker:build
pnpm docker:down:full
pnpm docker:up:full

# For faster iteration, use hybrid mode:
pnpm docker:down:full
pnpm dev  # Hot-reload works in hybrid mode
```

**Database connection errors in full stack?**

```bash
# Verify DB_HOST is set correctly
docker-compose exec app env | grep DB_HOST
# Should show: DB_HOST=postgres (not localhost)

# Check postgres container is running
docker ps | grep postgres

# Test connection from app container
docker-compose exec app psql -h postgres -U postgres -d complytude -c "SELECT 1"
```

**Volume permission issues (Linux)?**

```bash
# Fix ownership of mounted volumes
sudo chown -R $USER:$USER ./src ./node_modules

# Or run container as your user
docker-compose exec -u $(id -u):$(id -g) app bash
```

### Comparison: Hybrid vs Full Stack

| Aspect              | Hybrid Mode | Full Stack Mode       |
| ------------------- | ----------- | --------------------- |
| **Command**         | `pnpm dev`  | `pnpm docker:up:full` |
| **NestJS**          | Local       | Docker Container      |
| **Hot Reload**      | ✅ Fast     | ⚠️ Requires rebuild   |
| **Debugging**       | ✅ Native   | ⚠️ Remote attach      |
| **Startup**         | ⚡ ~5s      | 🐌 ~30s               |
| **Production-like** | ⚠️ Partial  | ✅ Identical          |
| **Best For**        | Development | Testing, CI/CD        |

**Recommendation:** Use hybrid mode (`pnpm dev`) for daily development, and full stack mode for deployment testing.

---

## Database Scripts

```bash
pnpm db:migrate     # Run migrations
pnpm db:setup       # Start services + run migrations
pnpm db:wait        # Wait for database to be ready
pnpm db:verify      # Verify multi-tenancy setup
pnpm db:test        # Run multi-tenancy test suite
```

### Details

**`pnpm db:migrate`**

- Runs all database migrations in order
- Skips already-executed migrations
- Tracks execution in `schema_migrations` table
- Safe to run multiple times (idempotent)

**`pnpm db:setup`**

- Combined command for initial database setup
- Starts Docker services
- Waits for database readiness
- Runs all migrations

**`pnpm db:wait`**

- Utility script that waits for PostgreSQL to be ready
- Used internally by other scripts
- Useful in CI/CD pipelines

**`pnpm db:verify`**

- Verifies multi-tenancy infrastructure
- Checks RLS policies are enabled
- Validates helper functions exist
- Shows tenant statistics

**`pnpm db:test`**

- Runs comprehensive multi-tenancy test suite
- Creates test tenants
- Tests schema isolation
- Tests RLS policies
- Cleans up after itself

For detailed database documentation, see [scripts/README.md](../scripts/README.md).

---

## Code Quality

```bash
pnpm lint           # ESLint with auto-fix
pnpm format         # Prettier formatting
pnpm type-check     # TypeScript validation
```

### Details

**`pnpm lint`**

- Runs ESLint on all TypeScript files
- Automatically fixes issues when possible
- Enforces code style and best practices
- **Run before committing** (also runs in pre-commit hook)

**`pnpm format`**

- Formats code with Prettier
- Applies consistent formatting
- Works on `src/` and `test/` directories

**`pnpm type-check`**

- Validates TypeScript types across entire project
- Does not emit compiled files
- Catches type errors before runtime
- **Runs in pre-commit hook**

### Pre-Commit Hook

These scripts run automatically before each commit via Husky:

1. `pnpm type-check` - Validates all TypeScript types
2. `pnpm lint-staged` - Lints and formats staged files only

To bypass (not recommended):

```bash
git commit --no-verify -m "your message"
```

---

## Advanced/Debug Scripts

These scripts are for advanced use cases, CI/CD, or debugging.

### Development Variants

```bash
pnpm start:dev      # Start with hot-reload (manual, services must be running)
pnpm start:debug    # Start with debugger attached
```

**When to use:**

- **`start:dev`** - When you want manual control over service startup (most developers should use `pnpm dev` instead)
- **`start:debug`** - When debugging with IDE breakpoints (VS Code, WebStorm, etc.)

### Debug Configuration

For `start:debug`, use this VS Code launch configuration:

```json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to NestJS",
  "port": 9229,
  "restart": true,
  "sourceMaps": true,
  "outFiles": ["${workspaceFolder}/dist/**/*.js"]
}
```

### Test Variants

Already covered in [Testing Scripts](#testing-scripts) section above.

### Git Hooks

```bash
pnpm prepare        # Install Husky git hooks
pnpm lint-staged    # Run lint on staged files
```

**When to use:**

- **`prepare`** - Automatically runs after `pnpm install` to setup git hooks
- **`lint-staged`** - Manually run lint on staged files (normally runs automatically in pre-commit hook)

---

## Script Categories Reference

Quick reference for which scripts to use when:

### First Time Setup

1. `pnpm install`
2. `pnpm project:setup`
3. `pnpm test:e2e` (verify installation)

### Daily Development

- `pnpm dev` - Start developing
- `pnpm test:e2e` - Run tests
- `pnpm lint` - Check code quality

### Before Committing

- `pnpm lint` - Check/fix linting issues
- `pnpm type-check` - Validate TypeScript
- `pnpm test:e2e` - Ensure tests pass

### Debugging Issues

- `pnpm docker:logs` - Check service logs
- `pnpm db:verify` - Verify database setup
- `pnpm start:debug` - Debug with breakpoints

### CI/CD Pipeline

- `pnpm install --frozen-lockfile`
- `pnpm type-check`
- `pnpm lint`
- `pnpm build`
- `pnpm test:e2e`

### Fresh Start (When Things Break)

1. `pnpm docker:reset` ⚠️ (deletes data)
2. `pnpm db:migrate`
3. `pnpm dev`

---

## Common Workflows

### Adding a New Feature

```bash
# 1. Start development
pnpm dev

# 2. Make your changes

# 3. Run relevant tests
pnpm test:e2e:auth        # If working on auth
pnpm test:e2e:storage     # If working on storage

# 4. Check code quality
pnpm lint
pnpm type-check

# 5. Run full test suite
pnpm test:e2e

# 6. Commit (hooks run automatically)
git add .
git commit -m "feat(module): description"
```

### Fixing a Bug

```bash
# 1. Reproduce the issue
pnpm dev

# 2. Write a failing test
pnpm test:e2e:watch       # Run in watch mode

# 3. Fix the bug

# 4. Verify fix
pnpm test:e2e

# 5. Commit
git commit -m "fix(module): description"
```

### Database Issues

```bash
# Check if services are running
docker ps

# View logs
pnpm docker:logs

# Verify database setup
pnpm db:verify

# If corrupted, reset
pnpm docker:reset         # ⚠️ Deletes all data
pnpm db:migrate
```

---

## Performance Tips

### Fast Iteration During Development

```bash
# Use feature-specific tests instead of full suite
pnpm test:e2e:auth        # ~10s instead of ~60s

# Use watch mode for unit tests
pnpm test:watch

# Only run migrations when schema changes
# (not needed on every start)
```

### Faster Docker Startup

```bash
# Use docker:start (not docker:reset) between sessions
pnpm docker:start         # Reuses existing containers

# Only reset when needed
pnpm docker:reset         # When data is corrupted
```

---

## Environment-Specific Commands

### Development

```bash
pnpm dev                  # Use this
pnpm docker:start         # Services with health checks
```

### Testing

```bash
pnpm test:e2e            # Full E2E suite
pnpm test:db:setup       # Separate test database
```

### Production

```bash
pnpm build
pnpm start:prod
# Note: Use proper PostgreSQL and S3 (not MinIO) in production
```

---

## Troubleshooting

### Port Already in Use

**Error:** `Port 3000 is already in use`

**Solution:**

```bash
# Option 1: Change port in .env
PORT=3001

# Option 2: Kill process using the port (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Option 3: Kill process (macOS/Linux)
lsof -ti:3000 | xargs kill -9
```

### Services Not Starting

**Error:** Docker containers fail to start

**Solution:**

```bash
# Check Docker is running
docker ps

# View logs
pnpm docker:logs

# Restart services
pnpm docker:stop
pnpm docker:start

# Nuclear option: reset everything
pnpm docker:reset         # ⚠️ Deletes all data
```

### Migration Errors

**Error:** Migration fails or database is corrupted

**Solution:**

```bash
# Reset database and re-run migrations
pnpm docker:reset         # ⚠️ Deletes all data
pnpm db:migrate

# Or verify first
pnpm db:verify
```

### Test Failures

**Error:** Tests fail unexpectedly

**Solution:**

```bash
# Ensure services are running
pnpm docker:start

# Reset test database
pnpm test:db:reset

# Check for port conflicts
# Edit test/test.env if needed

# Run specific test to isolate issue
pnpm test:e2e:auth
```

---

## Related Documentation

- [Main README](../README.md) - Project overview and quick start
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [test/README.md](../test/README.md) - Detailed testing guide
- [scripts/README.md](../scripts/README.md) - Database migrations and utilities
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) - Development workflow

---

## Need Help?

If you encounter issues:

1. Check this guide for the relevant script
2. Review the troubleshooting section above
3. Check service logs: `pnpm docker:logs`
4. Verify services are running: `docker ps`
5. See the [main README](../README.md) support section

---

**Last Updated:** December 2025

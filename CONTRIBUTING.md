# Contributing to Complytude

Thank you for your interest in contributing to Complytude! This guide will help you get started with our development workflow, commit standards, and contribution process.

## Table of Contents

- [Development Setup](#development-setup)
- [Git Hooks](#git-hooks)
- [Commit Message Standards](#commit-message-standards)
- [Pull Request Process](#pull-request-process)
- [Code Quality Requirements](#code-quality-requirements)

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
cp .env.example .env
pnpm project:setup              # Starts PostgreSQL + MinIO, runs migrations

# Daily development
pnpm dev                # Auto-starts services + development server

# Before committing
pnpm lint
pnpm type-check
pnpm test:e2e
```

**📚 Complete Script Reference:** See [docs/SCRIPTS.md](docs/SCRIPTS.md) for detailed documentation of all available scripts, including testing variants, Docker commands, database utilities, and debugging tools.

### Verify Your Setup

After setup, verify everything works:

```bash
# Check services are running
docker ps

# Should see:
# - complytude-postgres (port 5432)
# - complytude-minio (ports 9000, 9001)

# Test API
curl http://localhost:3000/api/health

# Test MinIO
open http://localhost:9001  # Login: minioadmin/minioadmin

# Run E2E tests
pnpm test:e2e
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
- Examples: `auth`, `templates`, `storage`, `workspace`, `database`

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
- Add E2E tests for verification

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
refactor(database): optimize workspace isolation queries (COM-42)

- Use prepared statements for workspace queries
- Cache workspace schema names
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

5. **Run tests locally**:

   ```bash
   pnpm test:e2e
   ```

6. **Commit your changes** following the [commit standards](#commit-message-standards)

7. **Push to your branch**:

   ```bash
   git push origin feature/your-feature
   ```

8. **Open a Pull Request** against the `development` branch

### PR Guidelines

- Provide a clear description of the changes
- Reference related issues
- Ensure all CI checks pass
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

### Testing

```bash
pnpm test            # Run unit tests
pnpm test:e2e        # Run E2E tests
pnpm test:cov        # Run tests with coverage
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

## Questions?

If you have questions about contributing, please:

1. Check the [main README](README.md) for project overview
2. Review the [documentation](docs/README.md)
3. Open an issue for discussion

Thank you for contributing! 🙏

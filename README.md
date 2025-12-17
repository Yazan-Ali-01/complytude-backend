# Complytude

> Modern SaaS platform for UAE legal document generation and compliance management

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify)](https://www.fastify.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [Available Scripts](#-available-scripts)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Development Workflow](#-development-workflow)
- [Git Hooks & Commit Standards](#-git-hooks--commit-standards)
- [Multi-Tenancy](#-multi-tenancy)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**Complytude** is a SaaS platform designed for UAE businesses to:

1. **Generate legal documents** - Fill in a form, get ready-to-use legal documents (Employment Contracts, NDAs, etc.)
2. **Analyze existing contracts** - Upload contracts and verify compliance with UAE labor laws
3. **Get compliance checklists** - Step-by-step guides for UAE authority requirements (DMCC, IFZA, DED, RAKEZ)

**Target Users**: Small businesses, startups, law firms, and consultants in the UAE who need legal document assistance without expensive legal fees.

---

## ✨ Features

### Core Features

- 🔐 **JWT Authentication** - Secure signup, login, email verification, password reset
- 🏢 **Multi-Tenancy** - Complete data isolation per organization with schema-based separation + RLS
- 👥 **User Management** - Role-based access control (Admin, Member, Viewer)
- 📄 **Template Management** - CRUD operations for legal document templates
- 💾 **S3-Compatible Storage** - Secure file upload/download with tenant isolation (AWS S3 or MinIO)
- 📊 **Plan-Based Features** - Subscription tiers (Early Access, Basic, Pro, Enterprise) with document limits
- 🏥 **Health Checks** - Database and storage health monitoring
- 📚 **API Documentation** - Auto-generated Swagger/OpenAPI documentation

### Infrastructure

- ⚡ **High Performance** - Built on Fastify for low latency and high throughput
- 🛡️ **Type Safety** - Strict TypeScript with comprehensive validation using `class-validator`
- 🔄 **Dependency Injection** - Clean architecture with NestJS DI container
- 🐳 **Docker Support** - Containerized PostgreSQL, MinIO, and optional pgAdmin
- 🧪 **E2E Testing** - Comprehensive test suite with Swagger contract validation

---

## 🛠 Tech Stack

### Backend

- **Framework**: [NestJS 11](https://nestjs.com/) with [Fastify](https://www.fastify.io/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Database**: [PostgreSQL 16](https://www.postgresql.org/)
- **Authentication**: [Passport JWT](https://www.passportjs.org/)
- **Validation**: [class-validator](https://github.com/typestack/class-validator) + [class-transformer](https://github.com/typestack/class-transformer)
- **Documentation**: [Swagger/OpenAPI](https://swagger.io/)

### Infrastructure

- **Storage**: AWS S3 / MinIO (S3-compatible)
- **Containerization**: Docker + Docker Compose
- **Testing**: Jest + Supertest

### Key Dependencies

```json
{
  "@nestjs/core": "^11.0.1",
  "@nestjs/platform-fastify": "^11.1.7",
  "@nestjs/config": "^4.0.2",
  "@nestjs/jwt": "^11.0.1",
  "@nestjs/passport": "^11.0.5",
  "@nestjs/swagger": "^11.2.1",
  "@aws-sdk/client-s3": "^3.914.0",
  "pg": "^8.16.3",
  "docxtemplater": "^3.67.1",
  "bcrypt": "^6.0.0",
  "joi": "^18.0.1"
}
```

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.x (LTS recommended)
- **npm** >= 9.x or **yarn** >= 1.22.x
- **pnpm** >= 8.x
- **Docker** >= 24.x (with Docker Compose)
- **PostgreSQL** 16.x (if not using Docker)
- **Git**

### Windows Users
## Setup
If you're using Windows, you'll need to configure your environment to ensure pnpm scripts work correctly (the same way they work on Linux/Mac).

**Option 1: Git Bash (Recommended)**

1. **Install Git Bash** (if not already installed):
   - Download and install [Git for Windows](https://git-scm.com/download/win)
   - This includes Git Bash by default

2. **Configure pnpm to use Git Bash**:
   - Add the following line to your `.npmrc` file in the project root:
   ```ini
   script-shell="C:\\Program Files\\Git\\bin\\bash.exe"
   ```
   - If Git Bash is installed in a different location, adjust the path accordingly

After this configuration, all pnpm scripts will run using Git Bash, ensuring compatibility with bash scripts and commands used throughout the project.

### Recommended Tools

- [Postman](https://www.postman.com/) - API testing (collection included)
- [pgAdmin](https://www.pgadmin.org/) - PostgreSQL management (included in Docker Compose)
- [VS Code](https://code.visualstudio.com/) - IDE with TypeScript support

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd complytude
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Environment Variables](#-environment-variables) section).

### 4. Start Docker Services

Start PostgreSQL and MinIO (S3-compatible storage):

```bash
pnpm docker:start

# Or start all services including pgAdmin:
pnpm docker:up:all
```

### 5. Run Database Migrations

Apply all database migrations to set up the schema:

```bash
pnpm db:migrate
```

Note: If you're on Windows, follow [this setup](#setup) to ensure the script works.


### 6. Start the Application

Start the development server:

```bash
pnpm start:dev
```

The application will be available at:

- **API**: http://localhost:3000/api
- **Swagger Docs**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/health

### 7. Verify Setup

```bash
# Check database connection
pnpm db:verify

# Run E2E tests
pnpm test:e2e
```

---

## 📁 Project Structure

```
complytude/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── auth/            # Authentication (JWT, signup, login)
│   │   ├── users/           # User management & RBAC
│   │   ├── tenant/          # Multi-tenancy & subscription plans
│   │   ├── storage/         # File upload/download (S3/MinIO)
│   │   ├── templates/       # Legal document templates
│   │   └── health/          # Health check endpoints
│   ├── common/               # Cross-cutting concerns
│   │   ├── guards/          # Auth guards (JWT, Tenant)
│   │   ├── decorators/      # Custom decorators (@CurrentUser, @TenantId)
│   │   ├── interceptors/    # Response transformers
│   │   └── middleware/      # Request middleware
│   ├── config/               # Configuration files
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── jwt.config.ts
│   │   ├── storage.config.ts
│   │   └── validation.schema.ts
│   ├── database/             # Database service & connection
│   ├── app.module.ts         # Root module
│   └── main.ts               # Application entry point
├── scripts/
│   ├── migrations/           # SQL migration files (run in order)
│   ├── utilities/            # Database utility scripts
│   ├── docker-start.sh       # Start Docker PostgreSQL
│   └── run-migrations.sh     # Execute all migrations
├── test/
│   ├── flows/                # E2E test suites (ordered)
│   ├── utils/                # Testing utilities
│   ├── swagger/              # Swagger spec validation
│   └── README.md             # Testing documentation
├── docker-compose.yml        # Docker services configuration
├── package.json              # NPM dependencies & scripts
├── tsconfig.json             # TypeScript configuration
├── nest-cli.json             # NestJS CLI configuration
└── README.md                 # This file
```

### Module Overview

| Module        | Description                                         | Status      |
| ------------- | --------------------------------------------------- | ----------- |
| **auth**      | JWT authentication, signup, login, password reset   | ✅ Complete |
| **users**     | User management, roles, multi-tenant membership     | ✅ Complete |
| **tenant**    | Organization management, subscription plans         | ✅ Complete |
| **storage**   | S3/MinIO file upload/download with tenant isolation | ✅ Complete |
| **templates** | Legal document template CRUD & versioning           | 🟡 Partial  |
| **health**    | Health checks for database and storage              | ✅ Complete |

---

## 🔧 Environment Variables

Create a `.env` file in the root directory with the following configuration:

```bash
# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=complytude

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# S3/MinIO Storage
STORAGE_TYPE=minio              # or 's3' for AWS
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=complytude
S3_FORCE_PATH_STYLE=true        # Required for MinIO

# File Upload Limits
MAX_FILE_SIZE=10485760          # 10MB in bytes
ALLOWED_FILE_TYPES=.pdf,.docx,.doc,.png,.jpg,.jpeg

# Optional: pgAdmin (if using docker:up:all)
PGADMIN_EMAIL=admin@complytude.com
PGADMIN_PASSWORD=admin
```

### Production Environment Variables

For production, ensure you:

- Change `JWT_SECRET` to a strong random value
- Use proper database credentials
- Configure AWS S3 instead of MinIO
- Set `NODE_ENV=production`
- Configure proper CORS origins

---

## 📜 Available Scripts

### Development

```bash
pnpm start           # Start application (production build)
pnpm start:dev       # Start with hot-reload (development)
pnpm start:debug     # Start with debugging enabled
pnpm build           # Build for production
```

### Testing

```bash
# Unit Tests
pnpm test            # Run unit tests
pnpm test:watch      # Run tests in watch mode
pnpm test:cov        # Run tests with coverage

# E2E Tests
pnpm test:e2e              # Run all E2E tests
pnpm test:e2e:auth         # Test authentication flow
pnpm test:e2e:tenant       # Test multi-tenancy
pnpm test:e2e:storage      # Test file storage
pnpm test:e2e:templates    # Test template management
pnpm test:e2e:features     # Test plan features
pnpm test:e2e:watch        # Run E2E tests in watch mode
pnpm test:e2e:coverage     # E2E tests with coverage

# Swagger Testing
pnpm test:swagger    # Download and validate Swagger spec
```

### Database

```bash
pnpm docker:start    # Start PostgreSQL in Docker
pnpm docker:stop     # Stop Docker containers
pnpm docker:logs     # View PostgreSQL logs
pnpm docker:reset    # ⚠️ Reset database (deletes all data)

pnpm db:migrate      # Run all migrations
pnpm db:setup        # Start Docker + run migrations
pnpm db:verify       # Verify multi-tenancy setup
pnpm db:test         # Test multi-tenancy isolation
```

### Docker Compose

```bash
pnpm docker:up:all   # Start all services (Postgres, MinIO, pgAdmin)
pnpm docker:down     # Stop and remove containers
pnpm docker:stop     # Stop containers (keep data)
```

### Code Quality

```bash
pnpm lint            # Run ESLint (auto-fix)
pnpm format          # Format code with Prettier
```

---

## 📚 API Documentation

### Swagger UI

The API documentation is auto-generated and available at:

**URL**: http://localhost:3000/docs

The Swagger UI provides:

- Interactive API explorer
- Request/response schemas
- Authentication (Bearer token)
- Try-it-out functionality

### Postman Collection

A pre-configured Postman collection is included:

- **Collection**: `Complytude_API.postman_collection.json`
- **Environment**: `Complytude_Development.postman_environment.json`

Import both files into Postman to get started quickly.

### Key Endpoints

#### Authentication

```
POST   /api/auth/signup           # Create new account
POST   /api/auth/login            # Login
POST   /api/auth/refresh          # Refresh access token
POST   /api/auth/logout           # Logout
POST   /api/auth/verify-email     # Verify email address
POST   /api/auth/forgot-password  # Request password reset
POST   /api/auth/reset-password   # Reset password
```

#### Users

```
GET    /api/users/me              # Get current user profile
PATCH  /api/users/me              # Update profile
PATCH  /api/users/me/password     # Change password
GET    /api/users/me/tenants      # Get user's tenants
GET    /api/users                 # List users (admin)
POST   /api/users                 # Create user (admin)
PATCH  /api/users/:id             # Update user (admin)
DELETE /api/users/:id             # Delete user (admin)
```

#### Tenants

```
POST   /api/tenants               # Create tenant
GET    /api/tenants               # List tenants
GET    /api/tenants/:id           # Get tenant details
PUT    /api/tenants/:id           # Update tenant
DELETE /api/tenants/:id           # Delete tenant
```

#### Storage

```
POST   /api/storage/upload        # Upload file
GET    /api/storage/list          # List files
GET    /api/storage/download/:key # Download file
GET    /api/storage/signed-url/:key # Get pre-signed URL
DELETE /api/storage/:key          # Delete file (admin)
```

#### Templates

```
GET    /api/templates             # List templates
GET    /api/templates/:key        # Get template details
POST   /api/templates             # Create template (admin)
PUT    /api/templates/:key        # Update template (admin)
DELETE /api/templates/:key        # Delete template (admin)
GET    /api/authorities           # List UAE authorities
GET    /api/categories            # List document categories
GET    /api/rulesets              # List legal rulesets
```

#### Health

```
GET    /api/health                # Overall health status
GET    /api/health/db             # Database health
GET    /api/health/storage        # Storage health
```

---

## 🧪 Testing

### Test Structure

```
test/
├── flows/                        # E2E test suites
│   ├── 01-authentication.e2e-spec.ts
│   ├── 02-multi-tenancy.e2e-spec.ts
│   ├── 03-storage.e2e-spec.ts
│   ├── 04-template-management.e2e-spec.ts
│   └── 05-plan-features.e2e-spec.ts
├── utils/                        # Testing utilities
│   ├── test-context.ts          # App instance manager
│   ├── test-database.ts         # Database utilities
│   ├── test-data-factory.ts     # Test data generation
│   ├── assertions.ts            # Custom assertions
│   └── swagger-validator.ts     # Schema validation
└── README.md                     # Detailed testing guide
```

### Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test flow
pnpm test:e2e:auth
pnpm test:e2e:tenant
pnpm test:e2e:storage
pnpm test:e2e:templates

# Watch mode
pnpm test:e2e:watch

# With coverage
pnpm test:e2e:coverage
```

### What Gets Tested

✅ **Business Logic**

- Authentication & authorization flows
- Multi-tenant data isolation
- Document upload limits (plan-based)
- RBAC permission enforcement
- Template versioning
- Feature flag access control

✅ **Data Integrity**

- Foreign key relationships
- Cascade delete operations
- Tenant schema isolation
- Audit trail consistency

✅ **API Contract**

- Swagger/OpenAPI schema validation
- Response structure verification
- Request validation
- HTTP status codes

✅ **Error Scenarios**

- Invalid authentication tokens
- Expired sessions
- Quota exceeded (403)
- Permission violations (403)
- Cross-tenant access attempts (403/404)
- Invalid input data (400)

For detailed testing documentation, see [`test/README.md`](test/README.md).

---

## 💻 Development Workflow

### 1. Create a New Module

```bash
# Generate a new module using NestJS CLI
nest g module modules/your-module
nest g controller modules/your-module
nest g service modules/your-module
```

### 2. Module Structure

Each module should follow this structure:

```
modules/your-module/
├── your-module.module.ts        # Module definition
├── your-module.controller.ts    # HTTP endpoints
├── your-module.service.ts       # Business logic
├── dto/                         # Data Transfer Objects
│   ├── create-your-module.dto.ts
│   └── update-your-module.dto.ts
└── entities/                    # Database entities (if needed)
    └── your-module.entity.ts
```

### 3. Best Practices

- ✅ Use dependency injection - never instantiate services manually
- ✅ DTOs with `class-validator` for all inputs
- ✅ Controllers handle HTTP only - no business logic
- ✅ Services contain business logic
- ✅ Use `@ApiTags()` and `@ApiOperation()` for Swagger docs
- ✅ Add guards for authentication and authorization
- ✅ Keep module boundaries clear - avoid circular imports
- ✅ Follow naming conventions: `*.controller.ts`, `*.service.ts`, `*.dto.ts`

### 4. Adding Database Migrations

1. Create new migration file: `scripts/migrations/00X_description.sql`
2. Use sequential numbering (001, 002, 003...)
3. Make it idempotent (use `IF NOT EXISTS`)
4. Run migrations: `pnpm db:migrate`

See [`scripts/README.md`](scripts/README.md) for detailed migration guide.

### 5. Code Quality Checks

```bash
# Lint code
pnpm lint

# Format code
pnpm format

# Type check
pnpm build

# Run tests
pnpm test
```

---

## 🔧 Git Hooks & Commit Standards

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

#### Required Format

```
type(scope): short description (issue-key)

- Bullet point changes
- Another change

Closes issue-key
```

#### Example

```
feat(templates): implement DOCX generation service (COM-4)

- Add Document Generation Service
- Integrate docxtemplater
- Add variable validation
- Write unit tests

Closes COM-4
```

#### Commit Message Rules

**Type** (required)

- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring (no functional changes)
- `test` - Adding or updating tests
- `docs` - Documentation changes
- `chore` - Build process, dependencies, tooling, and project maintenance

**Scope** (required)

- Short descriptor of the affected module/area
- Examples: `auth`, `templates`, `storage`, `tenant`, `database`

**Description** (required)

- Brief summary of the change
- Use imperative mood ("add" not "added")
- Don't end with a period
- Max length: 100 characters for the entire header line

**Body** (optional)

- Bullet points explaining what changed
- Leave a blank line after the header
- Use present tense

**Footer** (optional)

- References to issue tracker
- `Closes COM-123` or `Fixes COM-456`
- Leave a blank line before footer
- Used when this commit/PR completes the Linear issue

#### More Examples

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

#### Validation Errors

If your commit message doesn't follow the format, you'll see:

```bash
❌ Commit message validation failed!
📖 Please read 🔧 Git Hooks & Commit Standards section in README.md for examples
   Example: feat(auth): add login validation (COM-123)
```

**Common issues:**

| Error                                                                    | Cause                   | Solution                                         |
| ------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------ |
| `type must be one of [...]`                                              | Invalid type used       | Use only: feat, fix, refactor, test, docs, chore |
| `scope may not be empty`                                                 | Missing scope           | Add scope: `feat(auth): ...`                     |
| `header must not be longer than 100 characters`                          | Header too long         | Shorten description or move details to body      |
| `subject must not be sentence-case, start-case, pascal-case, upper-case` | Subject uses wrong case | Use lowercase: `add feature` not `Add Feature`   |

#### Tips

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

## 🏢 Multi-Tenancy

Complytude uses a **hybrid multi-tenancy approach** with:

1. **Schema-based isolation** - Each tenant gets their own PostgreSQL schema
2. **Row-Level Security (RLS)** - Additional security layer at database level

### How It Works

```sql
-- Public schema (shared)
public.tenants         -- Tenant metadata
public.users           -- User accounts
public.templates       -- Template definitions

-- Tenant schemas (isolated)
tenant_abc123.documents
tenant_xyz789.documents
```

### Tenant Context

The `@TenantId()` decorator automatically extracts the tenant ID from the authenticated user:

```typescript
@Get()
@UseGuards(JwtAuthGuard, TenantGuard)
async findAll(@TenantId() tenantId: string) {
  return this.service.findAll(tenantId);
}
```

### Tenant Isolation Features

- ✅ Complete data isolation per tenant
- ✅ Schema-level separation
- ✅ Row-Level Security (RLS) policies
- ✅ Automatic tenant context injection
- ✅ Prevents cross-tenant data access
- ✅ Plan-based feature access control

For detailed multi-tenancy documentation, see the architecture documentation.

---

## 🚀 Deployment

### Docker Deployment

1. Build the application:

```bash
docker build -t complytude:latest .
```

2. Run with Docker Compose:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Setup

1. Create production `.env` file
2. Update environment variables for production
3. Run database migrations
4. Start the application

```bash
# Production environment
NODE_ENV=production
pnpm build
pnpm start:prod
```

### Health Checks

Monitor application health:

```bash
# Check overall health
curl http://localhost:3000/api/health

# Check database
curl http://localhost:3000/api/health/db

# Check storage
curl http://localhost:3000/api/health/storage
```

---

## 📖 Additional Documentation

- [`scripts/README.md`](scripts/README.md) - Database migrations and utilities
- [`test/README.md`](test/README.md) - Testing guide
- [`PROJECT_STATUS.md`](PROJECT_STATUS.md) - Current project status and roadmap
- [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) - Development roadmap

---

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Write tests for your changes
5. Run tests: `pnpm test:e2e`
6. Commit your changes following the [commit standards](#-git-hooks--commit-standards)
7. Push to the branch: `git push origin feature/your-feature`
8. Open a Pull Request

### Commit Guidelines

This project enforces strict commit message standards. Before committing, please read the [Git Hooks & Commit Standards](#-git-hooks--commit-standards) section.

**Quick reference:**

```
type(scope): description (issue-key)

- Change 1
- Change 2

Closes issue-key
```

**Example:**

```
feat(auth): add OAuth2 integration (COM-100)

- Implement Google OAuth strategy
- Add user account linking
- Update authentication docs

Closes COM-100
```

For detailed examples and rules, see the [Commit Message Hook](#commit-message-hook) section.

---

## 📄 License

This project is licensed under the UNLICENSED license.

---

## 🆘 Support

### Common Issues

**Database Connection Failed**

```bash
# Check Docker is running
docker ps

# Restart database
pnpm docker:stop
pnpm docker:start
```

**Port Already in Use**

```bash
# Change port in .env file
PORT=3001
```

**Migration Errors**

```bash
# Reset database and re-run migrations
pnpm docker:reset
pnpm db:migrate
```

### Documentation

- [NestJS Documentation](https://docs.nestjs.com/)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## 👨‍💻 Author

**Yazan Ali**

---

## 🙏 Acknowledgments

- NestJS Team for the amazing framework
- Fastify Team for high-performance HTTP server
- PostgreSQL Community for robust database

---

<p align="center">Made with ❤️ for UAE businesses</p>

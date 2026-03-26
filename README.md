# Complytude

> Modern SaaS platform for UAE legal document generation and compliance management

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify)](https://www.fastify.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Documentation](#api-documentation)
- [Multi-Tenancy](#multi-tenancy)
- [Documentation](#documentation)
- [Support](#support)
- [License](#license)

---

## Overview

**Complytude** is a SaaS platform designed for UAE businesses to:

1. **Generate legal documents** - Fill in a form, get ready-to-use legal documents (Employment Contracts, NDAs, etc.)
2. **Analyze existing contracts** - Upload contracts and verify compliance with UAE labor laws
3. **Get compliance checklists** - Step-by-step guides for UAE authority requirements (DMCC, IFZA, DED, RAKEZ)

**Target Users**: Small businesses, startups, law firms, and consultants in the UAE who need legal document assistance without expensive legal fees.

---

## Features

### Core Features

- **JWT Authentication** - Dual-token authentication system with identity and tenant tokens, secure signup, login, email verification, password reset
- **Multi-Tenancy** - Complete data isolation per organization with Row-Level Security (RLS)
- **User Management** - Role-based access control (Admin, Member, Viewer)
- **Tenant Invitations** - Secure invitation system with token-based acceptance flow
- **Template Management** - CRUD operations for legal document templates
- **S3-Compatible Storage** - Secure file upload/download with tenant isolation (AWS S3 or MinIO)
- **Plan-Based Features** - Subscription tiers (Early Access, Basic, Pro, Enterprise) with document limits
- **Health Checks** - Database and storage health monitoring
- **API Documentation** - Auto-generated Swagger/OpenAPI documentation

### Infrastructure

- **High Performance** - Built on Fastify for low latency and high throughput
- **Type Safety** - Strict TypeScript with comprehensive validation using `class-validator`
- **Dependency Injection** - Clean architecture with NestJS DI container
- **Docker Support** - Containerized PostgreSQL, MinIO, and optional pgAdmin

---

## Tech Stack

| Category         | Technologies                        |
| ---------------- | ----------------------------------- |
| Framework        | NestJS 11 with Fastify              |
| Language         | TypeScript 5                        |
| Database         | PostgreSQL 16                       |
| Authentication   | Passport JWT                        |
| Validation       | class-validator + class-transformer |
| Documentation    | Swagger/OpenAPI                     |
| Storage          | MinIO (dev) / AWS S3 (production)   |
| Containerization | Docker + Docker Compose             |

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 22.16.0 (LTS recommended)
- **pnpm** >= 9.x
- **Docker** >= 24.x (with Docker Compose)
- **Git**

### Windows Users

If you're using Windows, configure pnpm to use Git Bash:

1. Install [Git for Windows](https://git-scm.com/download/win)
2. Add to your `.npmrc` file:
   ```ini
   script-shell="C:\\Program Files\\Git\\bin\\bash.exe"
   ```

---

## Quick Start

### First-Time Setup (Run Once)

1. **Clone & Install**

   ```bash
   git clone <repository-url>
   cd complytude
   pnpm install
   ```

2. **Environment Configuration**

   ```bash
   # Copy API environment file
   cp apps/api/.env.example apps/api/.env
   # Edit apps/api/.env with your configuration (see Environment Variables section)
   ```

3. **Start Services & Setup Database**

   ```bash
   pnpm project:setup
   ```

   This single command will:
   - ✅ Start PostgreSQL database
   - ✅ Start MinIO storage
   - ✅ Wait for services to be healthy
   - ✅ Run all database migrations
   - ✅ Verify the setup

**Services Available:**

- 🗄️ PostgreSQL: `localhost:5432`
- 📦 MinIO API: `http://localhost:9000`
- 🖥️ MinIO Console: `http://localhost:9001` (minioadmin/minioadmin)

---

### Daily Development Workflow

Start developing with a single command:

```bash
pnpm dev
```

This will:

- Check if Docker services are running (starts them if needed)
- Start the API server with hot-reload

**Or start apps individually:**

```bash
# Start API only (default)
pnpm start:api

# Start AI worker
pnpm start:worker-ai

# Start ingestion worker
pnpm start:worker-ingestion

# Start all apps together
pnpm dev:all
```

**Available at:**

- 🚀 API: http://localhost:3000/api
- 📚 Swagger Docs: http://localhost:3000/docs
- 🏥 Health Check: http://localhost:3000/api/health
- 📦 MinIO Console: http://localhost:9001

---

### Docker Deployment Options

Complytude supports three Docker deployment approaches:

#### Option 1: Hybrid Mode (Default - Recommended for Development)

**What you're using:** NestJS apps run locally, infrastructure services (PostgreSQL, Redis, MinIO) run in Docker

```bash
pnpm dev       # Start API only (auto-starts services + hot-reload)
pnpm dev:all   # Start all apps (API + workers)
```

✅ **Best for:** Active development, fast iteration, easy debugging

#### Option 2: Fully Dockerized - Development Mode

**Everything in containers with hot-reload:** API + Workers + PostgreSQL + Redis + MinIO all in Docker

```bash
# Build development image
pnpm docker:dev:build

# Start everything with hot-reload
pnpm docker:dev

# Or run in background
pnpm docker:dev:up

# View logs
pnpm docker:dev:logs

# Stop
pnpm docker:dev:down
```

✅ **Best for:** Development with Docker, team consistency, avoiding local Node.js issues

#### Option 3: Fully Dockerized - Production Mode

**Optimized production build:** Everything in containers with production optimizations

```bash
# Build production image
pnpm docker:prod:build

# Start production build
pnpm docker:prod

# Or run in background
pnpm docker:prod:up

# View logs
pnpm docker:prod:logs

# Stop
pnpm docker:prod:down
```

✅ **Best for:** Staging deployments, CI/CD, production-like environment

**Comparison:**

| Aspect              | Hybrid (Local) | Docker Dev | Docker Prod   |
| ------------------- | -------------- | ---------- | ------------- |
| **Hot Reload**      | ✅ Fast        | ✅ Fast    | ❌ No         |
| **Debugging**       | ✅ Native      | ✅ Good    | ⚠️ Limited    |
| **Startup**         | ⚡ ~5s         | 🐌 ~30s    | 🐌 ~30s       |
| **Production-like** | ⚠️ Partial     | ⚠️ Partial | ✅ Identical  |
| **Build Size**      | N/A            | ~300MB     | ~150MB        |
| **Security**        | N/A            | Root user  | Non-root user |

📚 **Full Docker Guide:** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed instructions

---

## Project Structure

```
complytude/
├── apps/                     # Monorepo applications
│   ├── api/                 # Main API application (REST API)
│   │   ├── src/            # Source code
│   │   │   ├── modules/    # Feature modules (auth, users, tenants, etc.)
│   │   │   ├── common/     # Guards, decorators, interceptors
│   │   │   ├── config/     # Configuration files
│   │   │   ├── database/   # Database service & connection
│   │   │   ├── repositories/ # Data access layer
│   │   │   ├── i18n/       # Internationalization
│   │   │   └── main.ts     # Application entry point
│   │   ├── docs/           # API-specific documentation
│   │   ├── Dockerfile      # Multi-stage Docker build
│   │   └── .env.example    # API environment variables template
│   ├── worker-ai/          # AI processing worker (BullMQ consumer)
│   │   ├── src/
│   │   └── docs/           # AI worker documentation (coming soon)
│   └── worker-ingestion/   # Data ingestion worker (BullMQ consumer)
│       ├── src/
│       └── docs/           # Ingestion worker documentation (coming soon)
├── libs/                    # Shared libraries
│   ├── redis/              # Redis connection and configuration
│   └── queue/              # BullMQ queue definitions and processors
├── scripts/                 # Database migrations and utility scripts
├── docs/                    # Monorepo-wide documentation
│   ├── ARCHITECTURE.md     # System architecture
│   ├── DATABASE.md         # Database schema
│   ├── DEPLOYMENT.md       # Deployment guide (Docker, production)
│   ├── DEPLOYMENT.md       # Deployment guide
│   └── README.md           # Documentation hub
└── docker-compose.yml       # Docker services
```

### Module Overview

| Module          | Description                                       | Status      |
| --------------- | ------------------------------------------------- | ----------- |
| **auth**        | JWT authentication, signup, login, password reset | ✅ Complete |
| **users**       | User management, roles, multi-tenant membership   | ✅ Complete |
| **tenant**      | Organization management, subscription plans       | ✅ Complete |
| **invitations** | Tenant invitations, accept/reject flows           | ✅ Complete |
| **storage**     | File upload/download via S3/MinIO with isolation  | ✅ Complete |
| **templates**   | Legal document template CRUD & versioning         | 🟡 Partial  |
| **health**      | Health checks for database, storage (MinIO/S3)    | ✅ Complete |

---

## Environment Variables

**📁 New Structure:** Each app has its own `.env` file in its directory.

Create environment files from examples:

```bash
# API service (required)
cp apps/api/.env.example apps/api/.env

# Worker services (optional, if using workers)
cp apps/worker-ai/.env.example apps/worker-ai/.env
cp apps/worker-ingestion/.env.example apps/worker-ingestion/.env
```

**API Environment (`apps/api/.env`):**

```bash
# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api

# CORS
CORS_ORIGINS=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=complytude
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000

# JWT Authentication
JWT_ACCESS_SECRET=your-super-secret-jwt-access-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-jwt-refresh-key-change-this-in-production
JWT_IDENTITY_SECRET=your-super-secret-jwt-identity-key-change-this-in-production
JWT_IDENTITY_REFRESH_SECRET=your-super-secret-jwt-identity-refresh-key-change-this-in-production
JWT_ACCESS_EXPIRES_IN=30m
JWT_IDENTITY_EXPIRES_IN=15m
# Redis-backed sessions — also drives identity + tenant refresh JWT expiry (jwt.refreshExpiresIn)
SESSION_MAX_TTL=14d
SESSION_IDLE_TIMEOUT=72h
SESSION_MAX_PER_USER=5
SESSION_ACTIVITY_THROTTLE_SECONDS=120

# S3/MinIO Storage
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_PREFIX=complytude
S3_FORCE_PATH_STYLE=true

# File Upload Limits
MAX_FILE_SIZE=10485760
SIGNED_URL_EXPIRES_IN=900

# Redis (Docker)
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO (Docker)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001

# pgAdmin (Optional)
PGADMIN_EMAIL=admin@complytude.com
PGADMIN_PASSWORD=admin
PGADMIN_PORT=5050
```

**📝 Notes:**

- Main configuration is in `apps/api/.env` (shared by all apps)
- When using fully dockerized mode (`pnpm docker:dev` or `pnpm docker:prod`), Docker Compose automatically overrides:
  - `DB_HOST` → `postgres`
  - `REDIS_HOST` → `redis`
  - `S3_ENDPOINT` → `http://minio:9000`
- Keep your `apps/api/.env` with `localhost` values for hybrid mode!
- For production configuration, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Available Scripts

### Essential Commands

```bash
# First-time setup
pnpm project:setup          # Start services, run migrations, verify setup

# Daily development
pnpm dev                    # Start API (auto-starts services + hot-reload)
pnpm dev:all                # Start all apps (API + workers)

# Start individual apps
pnpm start:api              # Start API only
pnpm start:worker-ai        # Start AI worker
pnpm start:worker-ingestion # Start ingestion worker

# Build
pnpm build:api              # Build API
pnpm build:worker-ai        # Build AI worker
pnpm build:worker-ingestion # Build ingestion worker
pnpm build:all              # Build all apps

# Production
pnpm start:api:prod         # Run API in production
pnpm start:worker-ai:prod   # Run AI worker in production
pnpm start:worker-ingestion:prod # Run ingestion worker in production
pnpm start:all:prod         # Run all apps in production

# Services Only (Hybrid Mode)
pnpm docker:start           # Start PostgreSQL + MinIO
pnpm docker:services        # Same as above
pnpm docker:stop            # Stop services (keeps data)
pnpm docker:down            # Stop and remove containers

# Database
pnpm db:migrate             # Run database migrations
pnpm db:seed                # Seed database with initial data
pnpm db:setup:full          # Run migrations + seeds (complete setup)

# Docker - Development Mode (API + Services)
pnpm docker:dev             # Start everything with hot-reload
pnpm docker:dev:up          # Start in background
pnpm docker:dev:down        # Stop and remove containers
pnpm docker:dev:logs        # View API logs
pnpm docker:dev:build       # Rebuild development image

# Docker - Production Mode (API + Services)
pnpm docker:prod            # Start production build
pnpm docker:prod:up         # Start in background
pnpm docker:prod:down       # Stop and remove containers
pnpm docker:prod:logs       # View API logs
pnpm docker:prod:build      # Rebuild production image

# Code quality
pnpm lint                   # ESLint with auto-fix
pnpm format                 # Prettier formatting
pnpm type-check             # TypeScript validation
```

**📚 Complete Script Reference:** See [scripts/README.md](scripts/README.md) for detailed documentation of all available scripts, including Docker commands, database utilities, and debugging tools.

---

## API Documentation

### Swagger UI

Interactive API documentation available at: **http://localhost:3000/docs**

### Key Endpoints

| Category       | Endpoints                                                   |
| -------------- | ----------------------------------------------------------- |
| Auth           | `POST /api/auth/signup`, `/login`, `/refresh`, `/logout`    |
| Invitations    | `POST /api/auth/invitations/:id/accept`, `/reject`          |
| Tenant Invites | `POST /api/tenants/admin/invitations`, `GET`, `DELETE /:id` |
| Users          | `GET /api/users/me`, `PATCH /api/users/me`                  |
| Tenants        | `POST /api/tenants`, `GET /api/tenants/:id`                 |
| Storage        | `POST /api/storage/upload`, `GET /api/storage/list`         |
| Templates      | `GET /api/templates`, `POST /api/templates`                 |
| Health         | `GET /api/health`, `/health/db`, `/health/storage`          |

---

## Multi-Tenancy

Complytude uses **Row-Level Security (RLS)** for complete data separation between tenants.

**Key Features:**

- Database-level tenant isolation with RLS policies
- Dual-token authentication (identity + tenant tokens)
- Automatic tenant context via `@AuthOptions()` decorator
- Plan-based feature access control

Example usage:

```typescript
@Get()
@AuthOptions({ tenant: true })
async findAll(@CurrentUserTenant() user: AuthenticatedTenantUser) {
  return this.service.findAll(user.tenantId);
}
```

---

## Documentation

### Monorepo-Wide Documentation

| Document                                     | Description                                     |
| -------------------------------------------- | ----------------------------------------------- |
| [docs/README.md](docs/README.md)             | Documentation hub and index                     |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and design patterns         |
| [docs/DATABASE.md](docs/DATABASE.md)         | Database schema, RLS, and data model            |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)     | Production deployment guide for all apps        |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Git hooks, commit standards, contribution guide |
| [scripts/README.md](scripts/README.md)       | Database migrations and utilities               |

### API Application Documentation

| Document                                                         | Description                               |
| ---------------------------------------------------------------- | ----------------------------------------- |
| [apps/api/docs/README.md](apps/api/docs/README.md)               | API documentation hub                     |
| [apps/api/docs/API_CONTRACTS.md](apps/api/docs/API_CONTRACTS.md) | API contract standards, authentication    |
| [apps/api/docs/DEVELOPMENT.md](apps/api/docs/DEVELOPMENT.md)     | API development workflow, module creation |

---

## AI Development Guidelines

This project uses Cursor AI rules for consistent development patterns and best practices. These rules help maintain code quality and architectural consistency across the codebase.

### Available Rules

- **[.cursor/rules/nest-js.mdc](.cursor/rules/nest-js.mdc)** - Core NestJS patterns, database architecture, and development conventions
- **[.cursor/rules/project-structure.mdc](.cursor/rules/project-structure.mdc)** - Complete project navigation and file organization guide
- **[.cursor/rules/technology-stack.mdc](.cursor/rules/technology-stack.mdc)** - Dependencies, versions, and compatibility matrix
- **[.cursor/rules/cursor-rules.mdc](.cursor/rules/cursor-rules.mdc)** - How to create and maintain Cursor rules
- **[.cursor/rules/self-improvement.mdc](.cursor/rules/self-improvement.mdc)** - Guidelines for updating rules

### Using the Rules

The rules are automatically applied when using Cursor AI to:

- Generate new modules and features
- Refactor existing code
- Answer questions about the codebase
- Suggest improvements and best practices

### Updating Rules

See [cursor-rules.mdc](.cursor/rules/cursor-rules.mdc) for detailed instructions on creating and updating rules. For information on when to update rules, refer to [self-improvement.mdc](.cursor/rules/self-improvement.mdc).

---

## Troubleshooting

**Services not starting?**

```bash
pnpm docker:stop && pnpm docker:start
```

**Port already in use?**

```bash
# Change port in .env
PORT=3001
```

**Database issues?**

```bash
pnpm docker:reset      # ⚠️ Deletes all data
pnpm db:migrate
```

For detailed troubleshooting, see [scripts/README.md](scripts/README.md#troubleshooting)

---

## Contributing

We welcome contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Git hooks and commit message standards
- Pull request process
- Code quality requirements

---

## License

This project is licensed under the UNLICENSED license.

---

## Author

**Yazan Ali**

---

## Acknowledgments

- NestJS Team for the amazing framework
- Fastify Team for high-performance HTTP server
- PostgreSQL Community for robust database

---

<p align="center">Made with ❤️ for UAE businesses</p>

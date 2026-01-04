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
- [Multi-Workspace](#multi-workspace)
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

- **JWT Authentication** - Secure signup, login, email verification, password reset
- **Multi-Workspace** - Complete data isolation per organization with schema-based separation + RLS
- **User Management** - Role-based access control (Admin, Member, Viewer)
- **Template Management** - CRUD operations for legal document templates
- **S3-Compatible Storage** - Secure file upload/download with workspace isolation (AWS S3 or MinIO)
- **Plan-Based Features** - Subscription tiers (Early Access, Basic, Pro, Enterprise) with document limits
- **Health Checks** - Database and storage health monitoring
- **API Documentation** - Auto-generated Swagger/OpenAPI documentation

### Infrastructure

- **High Performance** - Built on Fastify for low latency and high throughput
- **Type Safety** - Strict TypeScript with comprehensive validation using `class-validator`
- **Dependency Injection** - Clean architecture with NestJS DI container
- **Docker Support** - Containerized PostgreSQL, MinIO, and optional pgAdmin
- **E2E Testing** - Comprehensive test suite with Swagger contract validation

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
| Testing          | Jest + Supertest                    |

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
   cp .env.example .env
   # Edit .env with your configuration (see Environment Variables section)
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

4. **Verify Installation**
   ```bash
   pnpm test:e2e
   ```

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
- Start the development server with hot-reload

**Or start services individually:**

```bash
# Start backend services (PostgreSQL + MinIO)
pnpm docker:start

# Start development server
pnpm start:dev
```

**Available at:**

- 🚀 API: http://localhost:3000/api
- 📚 Swagger Docs: http://localhost:3000/docs
- 🏥 Health Check: http://localhost:3000/api/health
- 📦 MinIO Console: http://localhost:9001

---

### Docker Deployment Options

Complytude supports two Docker deployment approaches:

#### Option 1: Hybrid Mode (Default - Recommended for Development)

**What you're using:** NestJS runs locally, services run in Docker

```bash
pnpm dev  # Auto-starts services + local NestJS with hot-reload
```

✅ **Best for:** Active development, fast iteration, easy debugging

#### Option 2: Fully Dockerized

**Everything in containers:** NestJS + PostgreSQL + MinIO all in Docker

```bash
# Build the Docker image
pnpm docker:build

# Start everything
pnpm docker:up:full

# View logs
pnpm docker:logs:full
```

✅ **Best for:** Testing deployments, CI/CD, production-like environment

**Comparison:**

| Aspect              | Hybrid     | Fully Dockerized    |
| ------------------- | ---------- | ------------------- |
| **Hot Reload**      | ✅ Fast    | ⚠️ Requires rebuild |
| **Debugging**       | ✅ Native  | ⚠️ Remote           |
| **Startup**         | ⚡ ~5s     | 🐌 ~30s             |
| **Production-like** | ⚠️ Partial | ✅ Identical        |

📚 **Full Docker Guide:** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#docker-deployment) for detailed instructions

---

### Testing Your Changes

```bash
# Run all E2E tests
pnpm test:e2e

# Run unit tests
pnpm test

# Run specific feature tests
pnpm test:e2e:auth      # Authentication
pnpm test:e2e:storage   # File storage (uses MinIO)
pnpm test:e2e:workspace # Multi-workspace
```

---

## Project Structure

```
complytude/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── auth/            # Authentication (JWT, signup, login)
│   │   ├── users/           # User management & RBAC
│   │   ├── workspace/       # Multi-workspace & subscription plans
│   │   ├── storage/         # File upload/download (S3/MinIO)
│   │   ├── templates/       # Legal document templates
│   │   └── health/          # Health check endpoints
│   ├── common/               # Guards, decorators, interceptors, middleware
│   ├── config/               # Configuration files
│   ├── database/             # Database service & connection
│   └── main.ts               # Application entry point
├── scripts/                  # Migrations and utility scripts
├── test/                     # E2E test suites
├── docs/                     # Documentation
└── docker-compose.yml        # Docker services
```

### Module Overview

| Module        | Description                                       | Status      |
| ------------- | ------------------------------------------------- | ----------- |
| **auth**      | JWT authentication, signup, login, password reset | ✅ Complete |
| **users**     | User management, roles, multi-workspace membership| ✅ Complete |
| **workspace** | Organization management, subscription plans       | ✅ Complete |
| **storage**   | File upload/download via S3/MinIO with isolation  | ✅ Complete |
| **templates** | Legal document template CRUD & versioning         | 🟡 Partial  |
| **health**    | Health checks for database, storage (MinIO/S3)    | ✅ Complete |

---

## Environment Variables

Create a `.env` file in the root directory:

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
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=14d

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

**💡 Note:** When using fully dockerized mode (`pnpm docker:up:full`), the `docker-compose.yml` automatically overrides `DB_HOST` → `postgres` and `S3_ENDPOINT` → `http://minio:9000`. Keep your `.env` with `localhost` values for hybrid mode!

For production configuration, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Available Scripts

### Essential Commands

```bash
# First-time setup
pnpm project:setup          # Start services, run migrations, verify setup

# Daily development
pnpm dev            # Start development (auto-starts services + hot-reload)

# Testing
pnpm test:e2e       # Run all E2E tests
pnpm test           # Run unit tests

# Production
pnpm build          # Build for production
pnpm start:prod     # Run production build

# Services (Hybrid Mode)
pnpm docker:start   # Start PostgreSQL + MinIO
pnpm docker:stop    # Stop services (keeps data)

# Docker - Full Stack
pnpm docker:build   # Build NestJS Docker image
pnpm docker:up:full # Start everything in Docker
pnpm docker:logs:full # View all logs

# Code quality
pnpm lint           # ESLint with auto-fix
pnpm format         # Prettier formatting
pnpm type-check     # TypeScript validation
```

**📚 Complete Script Reference:** See [docs/SCRIPTS.md](docs/SCRIPTS.md) for detailed documentation of all available scripts, including testing variants, Docker commands, database utilities, and debugging tools.

---

## API Documentation

### Swagger UI

Interactive API documentation available at: **http://localhost:3000/docs**

### Key Endpoints

| Category  | Endpoints                                                |
| --------- | -------------------------------------------------------- |
| Auth      | `POST /api/auth/signup`, `/login`, `/refresh`, `/logout` |
| Users     | `GET /api/users/me`, `PATCH /api/users/me`               |
| Workspaces| `POST /api/workspaces`, `GET /api/workspaces/:id`        |
| Storage   | `POST /api/storage/upload`, `GET /api/storage/list`      |
| Templates | `GET /api/templates`, `POST /api/templates`              |
| Health    | `GET /api/health`, `/health/db`, `/health/storage`       |

### Postman Collection

Pre-configured Postman collection included:

- `Complytude_API.postman_collection.json`
- `Complytude_Development.postman_environment.json`

---

## Multi-Workspace

Complytude uses **schema-based isolation** with **Row-Level Security (RLS)** for complete data separation between workspaces.

**Key Features:**

- Each workspace gets their own PostgreSQL schema
- RLS policies for additional security
- Automatic workspace context via `@WorkspaceId()` decorator
- Plan-based feature access control

Example usage:

```typescript
@Get()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
async findAll(@WorkspaceId() workspaceId: string) {
  return this.service.findAll(workspaceId);
}
```

---

## Documentation

| Document                                     | Description                                     |
| -------------------------------------------- | ----------------------------------------------- |
| [docs/README.md](docs/README.md)             | Documentation hub and index                     |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Git hooks, commit standards, contribution guide |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)   | Development workflow, module creation           |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)     | Production deployment guide                     |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture (coming soon)               |
| [test/README.md](test/README.md)             | E2E testing guide                               |
| [scripts/README.md](scripts/README.md)       | Database migrations and utilities               |

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

For detailed troubleshooting, see [docs/SCRIPTS.md](docs/SCRIPTS.md#troubleshooting)

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

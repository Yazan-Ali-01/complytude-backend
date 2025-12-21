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

- **JWT Authentication** - Secure signup, login, email verification, password reset
- **Multi-Tenancy** - Complete data isolation per organization with schema-based separation + RLS
- **User Management** - Role-based access control (Admin, Member, Viewer)
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
| Storage          | AWS S3 / MinIO                      |
| Containerization | Docker + Docker Compose             |
| Testing          | Jest + Supertest                    |

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.x (LTS recommended)
- **pnpm** >= 8.x
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

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Environment Variables](#environment-variables)).

### 4. Start Docker Services

```bash
pnpm docker:start

# Or start all services including pgAdmin:
pnpm docker:up:all
```

### 5. Run Database Migrations

```bash
pnpm db:migrate
```

### 6. Start the Application

```bash
pnpm start:dev
```

The application will be available at:

- **API**: http://localhost:3000/api
- **Swagger Docs**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/health

### 7. Verify Setup

```bash
pnpm db:verify
pnpm test:e2e
```

---

## Project Structure

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

| Module        | Description                                         | Status      |
| ------------- | --------------------------------------------------- | ----------- |
| **auth**      | JWT authentication, signup, login, password reset   | ✅ Complete |
| **users**     | User management, roles, multi-tenant membership     | ✅ Complete |
| **tenant**    | Organization management, subscription plans         | ✅ Complete |
| **storage**   | S3/MinIO file upload/download with tenant isolation | ✅ Complete |
| **templates** | Legal document template CRUD & versioning           | 🟡 Partial  |
| **health**    | Health checks for database and storage              | ✅ Complete |

---

## Environment Variables

Create a `.env` file in the root directory:

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
STORAGE_TYPE=minio
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=complytude
S3_FORCE_PATH_STYLE=true

# File Upload Limits
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.pdf,.docx,.doc,.png,.jpg,.jpeg
```

For production configuration, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Available Scripts

### Development

```bash
pnpm start:dev       # Start with hot-reload
pnpm build           # Build for production
pnpm start:prod      # Start production build
```

### Testing

```bash
pnpm test            # Run unit tests
pnpm test:e2e        # Run all E2E tests
pnpm test:e2e:auth   # Test authentication flow
pnpm test:cov        # Run tests with coverage
```

For detailed testing documentation, see [test/README.md](test/README.md).

### Database

```bash
pnpm docker:start    # Start PostgreSQL
pnpm docker:up:all   # Start all services
pnpm db:migrate      # Run migrations
pnpm db:verify       # Verify setup
```

### Code Quality

```bash
pnpm lint            # Run ESLint
pnpm format          # Format with Prettier
pnpm type-check      # TypeScript type check
```

---

## API Documentation

### Swagger UI

Interactive API documentation available at: **http://localhost:3000/docs**

### Key Endpoints

| Category  | Endpoints                                                |
| --------- | -------------------------------------------------------- |
| Auth      | `POST /api/auth/signup`, `/login`, `/refresh`, `/logout` |
| Users     | `GET /api/users/me`, `PATCH /api/users/me`               |
| Tenants   | `POST /api/tenants`, `GET /api/tenants/:id`              |
| Storage   | `POST /api/storage/upload`, `GET /api/storage/list`      |
| Templates | `GET /api/templates`, `POST /api/templates`              |
| Health    | `GET /api/health`, `/health/db`, `/health/storage`       |

### Postman Collection

Pre-configured Postman collection included:

- `Complytude_API.postman_collection.json`
- `Complytude_Development.postman_environment.json`

---

## Multi-Tenancy

Complytude uses a **hybrid multi-tenancy approach**:

1. **Schema-based isolation** - Each tenant gets their own PostgreSQL schema
2. **Row-Level Security (RLS)** - Additional security layer at database level

### Tenant Context

The `@TenantId()` decorator automatically extracts the tenant ID from the authenticated user:

```typescript
@Get()
@UseGuards(JwtAuthGuard, TenantGuard)
async findAll(@TenantId() tenantId: string) {
  return this.service.findAll(tenantId);
}
```

### Key Features

- Complete data isolation per tenant
- Schema-level separation
- RLS policies for additional security
- Automatic tenant context injection
- Plan-based feature access control

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

## Support

### Common Issues

**Database Connection Failed**

```bash
docker ps              # Check Docker is running
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
pnpm docker:reset      # ⚠️ Deletes all data
pnpm db:migrate
```

### External Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

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

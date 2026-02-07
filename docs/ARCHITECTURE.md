# Architecture Documentation

Comprehensive architecture documentation for the Complytude platform.

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Architecture Patterns](#architecture-patterns)
- [Module Architecture](#module-architecture)
- [Database Architecture](#database-architecture)
- [Multi-Tenancy Implementation](#multi-tenancy-implementation)
- [Authentication & Authorization](#authentication--authorization)
- [Storage Architecture](#storage-architecture)
- [API Design](#api-design)
- [Security Architecture](#security-architecture)

---

## System Overview

Complytude is a **multi-tenant SaaS platform** for UAE legal document generation and compliance management, built with modern backend architecture principles. The system is organized as a monorepo with multiple applications.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  Web App (React/Next.js) • Mobile App • API Consumers           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway / Load Balancer                  │
│                      (nginx / AWS ALB)                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   NestJS Application Layer                       │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │     Auth     │   Tenants    │  Templates   │   Storage    │ │
│  │    Module    │    Module    │    Module    │    Module    │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Common: Guards, Interceptors, Pipes, Decorators        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                  │
│  ┌────────────────────────┬─────────────────────────────────┐   │
│  │   PostgreSQL 16        │    S3-Compatible Storage        │   │
│  │  (with RLS policies)   │    (MinIO / AWS S3)             │   │
│  └────────────────────────┴─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

| Decision           | Choice                    | Rationale                                         |
| ------------------ | ------------------------- | ------------------------------------------------- |
| **Framework**      | NestJS 11 with Fastify    | Performance, modularity, TypeScript-first         |
| **Database**       | PostgreSQL 16             | JSONB support, RLS for multi-tenancy, reliability |
| **Multi-Tenancy**  | Row-Level Security (RLS)  | Strong data isolation at database level           |
| **Authentication** | JWT with Passport         | Stateless, scalable, industry standard            |
| **Storage**        | S3-compatible (MinIO/AWS) | Scalable, tenant-isolated buckets                 |
| **Validation**     | class-validator           | Declarative, type-safe validation                 |
| **Documentation**  | Swagger/OpenAPI           | Auto-generated, interactive API docs              |

---

## Technology Stack

### Backend Framework

- **NestJS 11** - Modern TypeScript framework with dependency injection
- **Fastify** - High-performance HTTP server (default in NestJS 11)
- **TypeScript 5** - Type safety and modern JavaScript features

### Database & ORM

- **PostgreSQL 16** - Relational database with advanced features
- **Raw SQL** - Direct SQL for migrations and complex queries
- **Row-Level Security (RLS)** - Database-level tenant isolation

### Authentication & Security

- **Passport.js** - Authentication middleware
- **JWT** - Stateless token-based authentication
- **bcrypt** - Password hashing
- **class-validator** - Input validation

### Storage

- **MinIO** (Development) - S3-compatible object storage
- **AWS S3** (Production) - Cloud object storage

### Documentation & Testing

- **Swagger/OpenAPI** - API documentation
- **Jest** - Unit testing framework
- **Supertest** - E2E API testing

### DevOps

- **Docker** - Containerization
- **Docker Compose** - Local development orchestration
- **pnpm** - Fast, disk-efficient package manager

---

## Architecture Patterns

### 1. Clean Architecture

Complytude follows clean architecture principles with clear separation of concerns:

```
apps/api/src/
├── modules/              # Feature modules (business logic)
│   ├── auth/            # Authentication & authorization
│   ├── tenants/         # Multi-tenancy management
│   ├── users/           # User management
│   ├── invitations/     # Tenant invitations & membership
│   ├── templates/       # Template CRUD
│   └── storage/         # File storage
├── common/              # Cross-cutting concerns
│   ├── guards/         # Authorization guards
│   ├── interceptors/   # Request/response transformation
│   ├── decorators/     # Custom decorators
│   └── pipes/          # Validation pipes
├── config/             # Configuration management
├── database/           # Database connection & utilities
├── repositories/       # Data access layer
└── i18n/               # Internationalization
```

### 2. Dependency Injection

All services use NestJS's DI container:

```typescript
@Injectable()
export class TemplateService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
  ) {}
}
```

**Benefits:**

- Loose coupling
- Easy testing (mocking)
- Clear dependencies

### 3. Decorator-Based Authorization

Authorization is handled via decorators and guards at the route level:

```typescript
@AuthOptions({ tenant: true })
@UseGuards(PermissionsGuard)
@RequireAnyPermission('documents:read')
@Get()
async findAll(@CurrentUserTenant() user: AuthenticatedTenantUser) {
  return this.service.findAll(user.tenantId);
}
```

### 4. DTO Validation

All inputs are validated using DTOs:

```typescript
export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;
}
```

---

## Module Architecture

### Module Structure

Each module in the API application follows a consistent structure:

```
apps/api/src/modules/feature/
├── feature.module.ts        # Module definition
├── feature.controller.ts    # HTTP endpoints
├── feature.service.ts       # Business logic
├── dto/                     # Data Transfer Objects
│   ├── create-feature.dto.ts
│   └── update-feature.dto.ts
└── entities/                # Type definitions (optional)
    └── feature.entity.ts
```

### Module Dependencies

```mermaid
graph TD
    A[Auth Module] --> D[Database Module]
    B[Tenant Module] --> D
    C[Users Module] --> D
    C --> A
    E[Templates Module] --> D
    E --> B
    F[Storage Module] --> D
    F --> B
```

### Core Modules

| Module          | Responsibility                                                          | Dependencies                 |
| --------------- | ----------------------------------------------------------------------- | ---------------------------- |
| **auth**        | JWT authentication, signup, login, token refresh, user invitation flows | users, invitations, database |
| **users**       | User management, profile updates                                        | database                     |
| **tenants**     | Tenant creation, subscription management                                | users, database              |
| **invitations** | Tenant invitations, accept/reject, admin management                     | users, tenants, database     |
| **templates**   | Template CRUD, versioning                                               | storage, database            |
| **storage**     | File upload/download, S3 integration                                    | tenants, database            |
| **health**      | Health checks for services                                              | database, storage            |

---

## Database Architecture

### Schema Overview

The database uses a **multi-tenant architecture** with Row-Level Security (RLS) for data isolation.

**For detailed database documentation, see [DATABASE.md](DATABASE.md)**

### Table Categories

1. **Core Tables** (3)
   - `tenants` - Organizations
   - `users` - User accounts
   - `user_tenants` - Many-to-many with role assignments

2. **RBAC Tables** (3)
   - `roles` - System and custom role definitions
   - `permissions` - Permission definitions
   - `role_permissions` - Role-permission assignments

3. **Authentication Tables** (3)
   - `refresh_tokens` - JWT refresh tokens
   - `email_verifications` - Email verification tokens
   - `password_resets` - Password reset tokens

4. **Global Reference Tables** (8)
   - `authorities`, `categories` - Reference data
   - `templates`, `template_versions` - Templates with versioning
   - `rulesets`, `ruleset_versions` - Legal rulesets with versioning

5. **Tenant-Scoped Tables** (1)
   - `documents` - Generated documents (RLS enabled)

6. **Junction Tables** (3)
   - `template_rulesets` - Templates ↔ Rulesets
   - `template_version_ruleset_versions` - Version associations
   - `role_permissions` - Roles ↔ Permissions

### ER Diagram

View the complete ER diagram:

**📁 File:** `docs/database-schema.dbml`

**View online:**

1. Go to [dbdiagram.io](https://dbdiagram.io/)
2. Copy contents of `database-schema.dbml`
3. Paste into editor

---

## Multi-Tenancy Implementation

### Strategy: Row-Level Security (RLS)

Complytude uses PostgreSQL's Row-Level Security for tenant isolation:

**Advantages:**

- ✅ Strong isolation at database level
- ✅ No application-level filtering needed
- ✅ Automatic enforcement (can't be bypassed)
- ✅ Minimal performance overhead

### How It Works

1. **Application sets session context:**

   ```typescript
   @Injectable()
   export class TenantContextService {
     async setContext(tenantId: string, role: string, isAuthFlow = false) {
       // Set tenant context (transaction-local)
       await this.db.query(`SELECT set_config('app.tenant_id', $1, true)`, [
         tenantId,
       ]);

       // Set user-tenant role (transaction-local)
       await this.db.query(
         `SELECT set_config('app.user_tenant_role', $2, true)`,
         [role],
       );

       // Set auth flow flag if needed (transaction-local)
       if (isAuthFlow) {
         await this.db.query(
           `SELECT set_config('app.is_auth_flow', 'true', true)`,
         );
       }
     }
   }
   ```

2. **RLS policies filter automatically:**

   ```sql
   CREATE POLICY documents_select ON documents
   FOR SELECT USING (
       tenant_id = current_tenant_id_or_null()
   );
   ```

3. **Result:** Users only see their tenant's data

### Tenant Context Flow

```
Request → JWT Validation → Extract tenant_id → Set Session Context → Execute Query → RLS Filters → Response
```

### Global vs Tenant-Scoped Tables

| Type              | Tables                             | RLS    | Access                    |
| ----------------- | ---------------------------------- | ------ | ------------------------- |
| **Global**        | authorities, categories, templates | ❌ No  | Shared across all tenants |
| **Tenant-Scoped** | documents                          | ✅ Yes | Isolated per tenant       |

---

## Authentication & Authorization

### JWT-Based Authentication

**Dual-Token Authentication System:**

Complytude implements a sophisticated dual-token authentication system that separates identity verification from tenant-specific access:

```
┌────────────┐         ┌──────────────┐         ┌──────────────┐
│   Client   │         │   NestJS     │         │  PostgreSQL  │
└────────────┘         └──────────────┘         └──────────────┘
      │                       │                         │
      │  1. Login Request     │                         │
      ├──────────────────────>│                         │
      │                       │  2. Validate Credentials│
      │                       ├────────────────────────>│
      │                       │<────────────────────────│
      │  3. Identity Tokens   │                         │
      │  (Access + Refresh)   │                         │
      │<──────────────────────│                         │
      │                       │                         │
      │  4. Tenant Selection  │                         │
      │  + Identity Token     │                         │
      ├──────────────────────>│                         │
      │                       │  5. Validate Identity   │
      │                       │  6. Generate Tenant Tokens│
      │  7. Tenant Tokens     │                         │
      │  (Access + Refresh)   │                         │
      │<──────────────────────│                         │
      │                       │                         │
      │  8. API Request       │                         │
      │  + Tenant Access Token│                         │
      ├──────────────────────>│                         │
      │                       │  9. Validate JWT        │
      │                       │  10. Set Tenant Context │
      │                       ├────────────────────────>│
      │                       │  11. Query (RLS applies)│
      │                       │<────────────────────────│
      │  12. Response         │                         │
      │<──────────────────────│                         │
```

**System Admin Flow:**

- System admins receive identity tokens and can access system-wide endpoints
- They can optionally select a tenant to receive tenant tokens for tenant-specific operations

### Token Strategy

The system uses **four distinct token types**:

1. **Identity Access Token:** Short-lived (15 minutes), contains user identity and global roles, used for tenant selection and system admin operations
2. **Identity Refresh Token:** Long-lived (14 days), used to obtain new identity access tokens
3. **Tenant Access Token:** Short-lived (30 minutes), contains user + tenant info, used for tenant-scoped API access
4. **Tenant Refresh Token:** Long-lived (14 days), tenant-specific, used to obtain new tenant access tokens

All tokens are stored in HTTP-only cookies and refresh tokens are persisted in the database with type tracking (`identity` or `tenant`).

### Authorization Levels

1. **Route-Level:** `JwtAuthGuard` with `@AuthOptions()` decorator validates required tokens
2. **Identity-Level:** Identity tokens for user verification and system admin access
3. **Tenant-Level:** Tenant tokens provide tenant-scoped access
4. **Role-Level:** `RolesGuard` with `@Roles()` for simple role checks (e.g., `tenant_admin`)
5. **Permission-Level:** `PermissionsGuard` with `@RequirePermissions()` decorators for fine-grained RBAC
6. **Data-Level:** RLS policies enforce tenant isolation at database level

### Authentication Decorators

```typescript
// Public endpoint (no authentication)
@Get('public')
async publicEndpoint() { }

// Requires identity token only
@AuthOptions({ identity: true })
@Get('profile')
async getProfile(@CurrentUserIdentity() identity: AuthenticatedIdentityUser) { }

// Requires tenant token only
@AuthOptions({ tenant: true })
@Get('documents')
async listDocuments(@CurrentUserTenant() tenant: AuthenticatedTenantUser) { }

// Requires both tokens
@AuthOptions({ identity: true, tenant: true })
@Get('admin/tenant-info')
async getTenantInfo(
  @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  @CurrentUserTenant() tenant: AuthenticatedTenantUser,
) { }

// Permission-based access (requires tenant token)
@AuthOptions({ tenant: true })
@UseGuards(PermissionsGuard)
@RequireAnyPermission('documents:create')
@Post('documents')
async createDocument(@CurrentUserTenant() tenant: AuthenticatedTenantUser) { }

// Simple role check (e.g., tenant admin only)
@AuthOptions({ tenant: true })
@UseGuards(RolesGuard)
@Roles('tenant_admin')
@Post('admin-settings')
async updateAdminSettings(@CurrentUserTenant() tenant: AuthenticatedTenantUser) { }
```

---

## RBAC (Role-Based Access Control)

Complytude implements a **permission-based RBAC system** for fine-grained access control within tenants.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Permission Check Flow                          │
├─────────────────────────────────────────────────────────────────┤
│  Request → JWT Guard → Extract role from token                   │
│         → PermissionsGuard → RbacService.hasPermission()         │
│         → System role: In-memory lookup (O(1))                   │
│         → Custom role: Database query                            │
│         → Permission matcher (wildcard support)                  │
│         → Allow/Deny                                             │
└─────────────────────────────────────────────────────────────────┘
```

### RBAC Sync Service

The `RbacSyncService` automatically synchronizes permissions and system roles from code to database on application startup:

```
┌─────────────────────────────────────────────────────────────────┐
│                    RBAC Sync Flow (OnModuleInit)                  │
├─────────────────────────────────────────────────────────────────┤
│  App Startup → RbacSyncService.onModuleInit()                    │
│             → syncPermissions() - Sync ALL_TENANT_PERMISSIONS    │
│             → syncSystemRoles() - Sync system role definitions   │
│             → Sync role-permission mappings                      │
│             → Database reflects code constants                   │
└─────────────────────────────────────────────────────────────────┘
```

**Sync Strategy:**

- **Permissions:** Add new, update existing, delete removed (from `ALL_TENANT_PERMISSIONS` array)
- **System Roles:** Add new, update existing, sync role-permission mappings
- **Custom Roles:** Never touched (tenant_id IS NOT NULL)
- **Idempotent:** Safe to run on every startup

**Key Files:**

- `src/common/constants/tenant-permissions.constant.ts` - Single source of truth for permissions
- `src/common/constants/tenant-system-roles.constant.ts` - In-memory system role permission sets
- `src/modules/rbac/rbac-sync.service.ts` - Database synchronization logic

### System Roles

Four predefined system roles with in-memory permission sets for optimal performance:

| Role              | Key             | Permissions                                      | Description                                  |
| ----------------- | --------------- | ------------------------------------------------ | -------------------------------------------- |
| **Tenant Admin**  | `tenant_admin`  | `*:*` (wildcard)                                 | Full access to all tenant features           |
| **Legal Counsel** | `legal_counsel` | `documents:*`, `contracts:*`, `templates:*`, `regulatory:query` | AI drafting, analysis, templates, regulatory |
| **Member**        | `member`        | `documents:create`, `documents:read`, `templates:use`, `regulatory:query` | Basic document creation and viewing          |
| **Viewer**        | `viewer`        | `documents:read`, `regulatory:query`             | Read-only access                             |

**Note:** System roles use wildcards (e.g., `documents:*`) for cleaner permission sets. The permission matcher handles wildcard expansion at runtime.

### Permission Format

Permissions follow the pattern: `{resource}:{action}`

**Available Resources:**

- `documents` - Document management (create, read, delete)
- `contracts` - Contract analysis (analyze, redline)
- `templates` - Template management (manage, use)
- `regulatory` - Regulatory queries (query)
- `billing` - Billing management (manage)
- `team` - Team management (manage)
- `settings` - Tenant settings (manage, change_jurisdiction)

**Available Actions:**

- `create`, `read`, `delete` - Standard CRUD
- `manage` - Full control over resource
- `use` - Use without management rights
- `analyze`, `redline` - Specific operations
- `query` - Query/search operations
- `change_jurisdiction` - Critical setting change

**Wildcard Support:**

- `documents:*` - All document permissions
- `*:read` - Read permission on all resources
- `*:manage` - Manage permission on all resources
- `*:*` - All permissions (tenant_admin only)

### Permission Decorators

```typescript
import {
  RequireAllPermissions,
  RequireAnyPermission,
} from 'src/common/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';

// Require ANY of the specified permissions (OR logic)
@AuthOptions({ tenant: true })
@UseGuards(PermissionsGuard)
@RequireAnyPermission('documents:read', 'templates:use')
@Get()
async listResources() { }

// Require ALL specified permissions (AND logic)
@AuthOptions({ tenant: true })
@UseGuards(PermissionsGuard)
@RequireAllPermissions('documents:read', 'documents:delete')
@Delete(':id')
async deleteDocument() { }

// Wildcard permission
@AuthOptions({ tenant: true })
@UseGuards(PermissionsGuard)
@RequireAnyPermission('documents:*')
@Post()
async createDocument() { }

// Simple role check (tenant admin only)
@AuthOptions({ tenant: true })
@UseGuards(RolesGuard)
@Roles('tenant_admin')
@Post('admin-only')
async adminOnlyAction() { }
```

### When to Use Which Guard

| Guard | Use Case | Example |
| ----- | -------- | ------- |
| `PermissionsGuard` | Fine-grained permission checks | `documents:create`, `templates:manage` |
| `RolesGuard` | Simple role verification | Check if user is `tenant_admin` |

### Global Module Architecture

**RbacModule is a Global Module** - marked with `@Global()` decorator for application-wide availability.

**Design Decision:**

RBAC is a cross-cutting concern similar to authentication. Making `RbacModule` global eliminates the need to import it in every feature module that uses `PermissionsGuard`.

**Implementation:**

```typescript
// src/modules/rbac/rbac.module.ts
@Global()  // ← Makes module available everywhere
@Module({
  imports: [DatabaseModule],
  providers: [RbacService, PermissionsGuard, ...],
  exports: [RbacService, PermissionsGuard, ...],
})
export class RbacModule {}
```

**Usage in Feature Modules:**

```typescript
// ✅ CORRECT: No RbacModule import needed
@Module({
  controllers: [MyController], // Uses PermissionsGuard
})
export class MyModule {}

// ❌ WRONG: Don't import RbacModule in feature modules
@Module({
  imports: [RbacModule], // ← Not needed! RbacModule is global
  controllers: [MyController],
})
export class MyModule {}
```

**What's Available Globally:**

- `RbacService` - Permission checking logic
- `PermissionsGuard` - Permission-based authorization guard
- `RolesRepository` - Role data access
- `PermissionsRepository` - Permission data access

**Benefits:**

1. **Reduced Boilerplate:** No need to import `RbacModule` in 20+ feature modules
2. **Cleaner Dependencies:** Feature modules don't need to know about RBAC implementation
3. **Consistent with NestJS Patterns:** Similar to how `ConfigModule` and `AuthModule` work
4. **Single Import:** `RbacModule` imported once in `AppModule`

### Permission Matching Logic

The `matchTenantPermission()` function handles wildcard matching:

```typescript
// User permission expands to cover required permission
matchTenantPermission('*:*', 'documents:read')      // true - covers everything
matchTenantPermission('documents:*', 'documents:read') // true - covers all document actions
matchTenantPermission('*:read', 'documents:read')   // true - covers read on all resources
matchTenantPermission('documents:read', 'documents:read') // true - exact match

// No match
matchTenantPermission('documents:read', 'documents:create') // false - different actions
matchTenantPermission('documents:create', 'documents:*')    // false - user doesn't have wildcard
```

### Custom Roles (MVP+)

Custom tenant roles are stored in the database and can be created by tenant admins:

- Custom roles cannot use reserved system role keys (`tenant_admin`, `legal_counsel`, `member`, `viewer`)
- Permissions are queried from the database (single query per request)
- Support for role-permission assignments via junction table
- Custom roles have `tenant_id` set and `is_system = false`

### Database Tables

| Table                   | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `roles`                 | Role definitions (system + custom)       |
| `permissions`           | Permission definitions (synced from code)|
| `role_permissions`      | Many-to-many role-permission assignments |
| `user_tenants.role_key` | User's role within a tenant              |

**Note:** The `permissions` table is automatically populated by `RbacSyncService` from `ALL_TENANT_PERMISSIONS` constant on app startup.

**For detailed database schema, see [DATABASE.md](DATABASE.md)**

### Performance Optimizations

1. **System roles:** In-memory permission lookup via `TENANT_SYSTEM_ROLE_PERMISSIONS` map (O(1), no database queries)
2. **Custom roles:** Single database query per request via `RolesRepository.getPermissionsForRole()`
3. **Wildcard matching:** Efficient in-memory pattern matching via `matchTenantPermission()`
4. **Permission sync:** Database always reflects code constants (no manual SQL needed)

---

## Storage Architecture

### S3-Compatible Storage

Uses S3-compatible object storage with tenant-isolated buckets:

```
Bucket Structure:
complytude-{tenant-id}/
├── templates/
│   └── {template-id}/
│       └── versions/
│           └── {version-id}.docx
└── documents/
    └── {document-id}/
        └── {filename}.pdf
```

### Storage Service

```typescript
@Injectable()
export class StorageService {
  async uploadFile(
    tenantId: string,
    file: Buffer,
    path: string,
  ): Promise<string> {
    const bucket = `complytude-${tenantId}`;
    await this.ensureBucketExists(bucket);
    return this.s3Client.upload(bucket, path, file);
  }
}
```

### Features

- ✅ Tenant-isolated buckets
- ✅ Pre-signed URLs for secure access
- ✅ File size limits (configurable per plan)
- ✅ Automatic bucket creation

---

## API Design

### RESTful Principles

All endpoints follow REST conventions:

| Method | Endpoint             | Action             |
| ------ | -------------------- | ------------------ |
| GET    | `/api/templates`     | List all templates |
| GET    | `/api/templates/:id` | Get one template   |
| POST   | `/api/templates`     | Create template    |
| PATCH  | `/api/templates/:id` | Update template    |
| DELETE | `/api/templates/:id` | Delete template    |

### Response Format

**Success:**

```json
{
  "id": "uuid",
  "name": "Template Name",
  "status": "active",
  "createdAt": "2026-01-20T10:00:00Z"
}
```

**Error:**

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

### API Versioning

API prefix: `/api` (v1 is implicit)

Future versions: `/api/v2`

### Documentation

Interactive API docs available at:

- **Development:** http://localhost:3000/docs
- **Swagger JSON:** http://localhost:3000/docs-json

---

## Security Architecture

### Security Layers

1. **Transport Layer:** HTTPS (production)
2. **Authentication:** JWT tokens
3. **Authorization:** Guards + RLS
4. **Input Validation:** class-validator
5. **Output Sanitization:** Interceptors
6. **Rate Limiting:** (planned)

### Security Features

- ✅ Bcrypt password hashing (10 rounds)
- ✅ JWT secrets rotation ready
- ✅ CORS configuration
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (validation)
- ✅ Row-Level Security for data isolation
- ✅ Helmet security headers (planned)

### Environment Variables

Sensitive configuration via environment variables:

```bash
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
DB_PASSWORD=<secret>
S3_SECRET_KEY=<secret>
```

**Never commit secrets to version control.**

---

## Performance Considerations

### Database Optimization

- Composite indexes for tenant-scoped queries
- Partial indexes for common filters
- Connection pooling (configurable)
- Query result caching (planned)

### Application Optimization

- Fastify for high-performance HTTP
- Dependency injection for efficient resource use
- Lazy module loading
- Response compression (planned)

### Scalability

- Stateless design (horizontal scaling)
- Database read replicas (planned)
- CDN for static assets (planned)
- Redis caching layer (planned)

---

## Logging Architecture

### Overview

Complytude uses **structured logging** with Pino and nestjs-pino for high-performance, machine-readable logs across all services (API Gateway, Worker AI, Worker Ingestion).

### Key Features

- ✅ **Structured JSON Logging** - NDJSON format for log aggregation
- ✅ **Request Correlation** - Unique `trace_id` for distributed tracing
- ✅ **Tenant Context** - Automatic `tenant_id` injection from JWT
- ✅ **Service Identification** - `service_name` field for multi-service architecture
- ✅ **Auto HTTP Logging** - Request/response logging with intelligent filtering
- ✅ **Environment-Based** - Pretty-print in dev, NDJSON in production

### Logging Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client Request                              │
│                    x-request-id: abc-123                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (Pino)                           │
│  [INFO] Request received                                         │
│  { trace_id: "abc-123", service_name: "gateway",                │
│    tenant_id: "tenant-uuid", req: {...} }                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Worker AI (Pino)                             │
│  [INFO] Job received                                             │
│  { trace_id: "abc-123", service_name: "worker-ai",              │
│    job_id: "job-uuid" }                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Gateway Response (Pino)                      │
│  [INFO] Request completed                                        │
│  { trace_id: "abc-123", service_name: "gateway",                │
│    res: { statusCode: 200, responseTime: 145 } }                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                          stdout (NDJSON)
                              ↓
                  Log Aggregator (Datadog/ELK)
```

### Log Structure

**Required Fields (Always Present):**

```json
{
  "level": "info",
  "time": "2026-02-08T10:30:00.123Z",
  "msg": "Request completed",
  "trace_id": "abc-123-def-456",
  "service_name": "gateway"
}
```

**Conditional Fields (When Available):**

```json
{
  "level": "info",
  "time": "2026-02-08T10:30:00.123Z",
  "msg": "Document created",
  "trace_id": "abc-123-def-456",
  "service_name": "gateway",
  "tenant_id": "tenant-uuid",
  "user_id": "user-uuid",
  "document_id": "doc-uuid"
}
```

### Distributed Tracing

Every request gets a unique `trace_id` for correlation across services:

1. **Client → Gateway**: Generates or receives `trace_id` via `x-request-id` header
2. **Gateway → Worker**: Forwards `trace_id` in `x-request-id` header
3. **All Services**: Log with same `trace_id` for correlation

**Query Example:**
```
# In Datadog/ELK, find all logs for a request
trace_id:"abc-123-def-456"
```

### Tenant Context

Logs automatically include `tenant_id` from authenticated requests:

```typescript
// Extracted from JWT in pino.config.ts
if (req.auth?.tenant?.tenantId) {
  customProps.tenant_id = req.auth.tenant.tenantId;
  customProps.user_id = req.auth.tenant.userId;
}
```

### Service Identification

Each service has a unique `service_name`:

| Service | Service Name | Port |
|---------|--------------|------|
| API Gateway | `gateway` | 3000 |
| Worker AI | `worker-ai` | 3001 |
| Worker Ingestion | `worker-ingestion` | 3002 |

### Log Levels

| Level | Value | Production Usage |
|-------|-------|------------------|
| `fatal` | 60 | System crash |
| `error` | 50 | Errors requiring investigation |
| `warn` | 40 | Warnings |
| **`info`** | **30** | **Production default** |
| `debug` | 20 | Development default |
| `trace` | 10 | Detailed debugging |

### Environment Configuration

**Development:**
```bash
LOG_LEVEL=debug
LOG_PRETTY=true      # Human-readable output
```

**Production:**
```bash
LOG_LEVEL=info
LOG_PRETTY=false     # NDJSON for log aggregators
```

### Auto HTTP Logging

HTTP requests/responses are automatically logged with:

- Request method, URL, headers
- Response status code, response time
- Automatic filtering of health check endpoints

**Filtered Endpoints (No Logging):**
- `/health`
- `/api/health`
- `/metrics`

### Log Aggregation

**Recommended Setup:**

```
Services → stdout → Docker/K8s Logs → Log Aggregator
```

**Supported Aggregators:**
- **Datadog** (Recommended) - Best-in-class APM and logs
- **ELK Stack** - Self-hosted alternative
- **AWS CloudWatch** - AWS-native solution

### Audit Logging vs System Logging

**System Logging (Pino → stdout):**
- Purpose: Operations, debugging, performance
- Storage: Short-term (7-30 days)
- Destination: Log aggregator

**Audit Logging (Database):**
- Purpose: Compliance, security, user actions
- Storage: Long-term (years)
- Destination: PostgreSQL `audit_logs` table

### Performance

**Benchmarks:**
- Pino: ~66,000 ops/sec
- Winston: ~14,000 ops/sec (4.7x slower)
- Bunyan: ~31,000 ops/sec (2.1x slower)

**Production Settings:**
- Asynchronous writes (non-blocking)
- Buffered output (4096 bytes)
- Minimal serialization overhead

### Usage Example

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  async createDocument(tenantId: string, data: any) {
    this.logger.log('Creating document', { 
      tenantId, 
      documentType: data.type 
    });

    try {
      const doc = await this.documentRepository.create(data);
      this.logger.log('Document created', { 
        documentId: doc.id 
      });
      return doc;
    } catch (error) {
      this.logger.error('Document creation failed', error.stack);
      throw error;
    }
  }
}
```

### Documentation

- [Logger Module README](../libs/shared/src/logger/README.md) - Developer guide
- [Infrastructure Logging Guide](../infra/logging-module/README.md) - Production setup

---

## Related Documentation

- [DATABASE.md](DATABASE.md) - Detailed database schema
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide for all apps
- [API Development Guide](../apps/api/docs/DEVELOPMENT.md) - API development workflow
- [API Contracts](../apps/api/docs/API_CONTRACTS.md) - API specifications
- [Main README](../README.md) - Project overview

---

**Last Updated:** February 3, 2026

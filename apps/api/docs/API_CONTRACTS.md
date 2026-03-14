# API Contracts Documentation

> **Purpose:** Define standards and conventions for API contract definition across all modules

**Last Updated:** March 14, 2026
**Status:** Foundation Complete

---

## Table of Contents

- [Overview](#overview)
- [API Versioning](#api-versioning)
- [Authentication Strategy](#authentication-strategy)
- [Complete Signup-to-Operational Flow](#complete-signup-to-operational-flow)
- [Request Contracts](#request-contracts)
- [Response Contracts](#response-contracts)
- [Error Handling](#error-handling)
- [Naming Conventions](#naming-conventions)
- [Swagger Documentation](#swagger-documentation)
- [Invitation System](#invitation-system)
- [Examples](#examples)

---

## Overview

This document defines the standards for API contract definition in the Complytude platform. All API endpoints must follow these conventions to ensure:

- **Consistency** - Predictable API behavior across all modules
- **Type Safety** - Full TypeScript coverage for requests and responses
- **Documentation** - Complete Swagger/OpenAPI documentation
- **Frontend Ready** - Frontend developers can build without backend clarification

### Guiding Principles

1. **Contract First** - Define DTOs and Swagger annotations before implementing logic
2. **Explicit Over Implicit** - Every field, constraint, and response must be documented
3. **Standard Errors** - Use consistent error response shapes
4. **No Business Logic** - Controllers are thin routing layers only

---

## API Versioning

### Overview

The API uses **URI-based versioning** to provide a clear, explicit versioning strategy. All API endpoints are prefixed with a version identifier.

**Current Version:** `v1`

### URL Structure

```
https://api.complytude.com/api/v1/{resource}
```

**Examples:**

```
POST   /api/v1/auth/login
GET    /api/v1/users/profile
POST   /api/v1/documents
GET    /api/v1/tenants
```

### Version-Neutral Endpoints

Some endpoints are **version-neutral** and do not include the version prefix:

| Endpoint         | Purpose               | Reason                                      |
| ---------------- | --------------------- | ------------------------------------------- |
| `/health`        | Health check          | Infrastructure endpoint, stable contract    |
| `/health/db`     | Database health       | Infrastructure endpoint, stable contract    |
| `/health/redis`  | Redis health          | Infrastructure endpoint, stable contract    |
| `/health/queues` | Queue health          | Infrastructure endpoint, stable contract    |
| `/docs`          | Swagger documentation | Documentation always reflects current state |
| `/admin/queues`  | Bull Board dashboard  | Admin tool, not part of public API          |
| `/api/` (root)   | API root              | Simple welcome/info endpoint                |

### Default Versioning Behavior

- **Default Version:** All controllers without explicit version configuration automatically use `v1`
- **No Migration Needed:** Existing controllers are automatically versioned as `v1` without code changes

### Controller Versioning

#### Standard Versioned Controller (Default Behavior)

Most controllers automatically use version `v1`:

```typescript
@Controller('users')
export class UsersController {
  // Accessible at /api/v1/users
}
```

#### Version-Neutral Controller

For infrastructure or admin endpoints:

```typescript
import { Controller, VERSION_NEUTRAL } from '@nestjs/common';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  // Accessible at /health (no version prefix)
}
```

#### Explicit Version Controller

For future versioning (when v2 is needed):

```typescript
@Controller({ path: 'users', version: '2' })
export class UsersV2Controller {
  // Accessible at /api/v2/users
}
```

### Method-Level Versioning

You can also version individual methods within a controller:

```typescript
import { Controller, Get, Version } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  @Version('1')
  getUsersV1() {
    // Accessible at /api/v1/users
  }

  @Get()
  @Version('2')
  getUsersV2() {
    // Accessible at /api/v2/users
  }
}
```

### Future Versioning Strategy

When breaking changes are needed:

1. **Create a new controller** for the new version (e.g., `UsersV2Controller`)
2. **Keep the old controller** active for backward compatibility
3. **Document deprecation** in Swagger annotations
4. **Set sunset date** for old version
5. **Remove old version** after sunset period (in production)

**Example:**

```typescript
// apps/api/src/modules/users/users-v1.controller.ts
@Controller({ path: 'users', version: '1' })
@ApiDeprecated('Use /api/v2/users instead. Sunset date: 2027-01-01')
export class UsersV1Controller { ... }

// apps/api/src/modules/users/users-v2.controller.ts
@Controller({ path: 'users', version: '2' })
export class UsersV2Controller { ... }
```

### Best Practices

1. **Default Version:** Let controllers use the default version unless you need explicit control
2. **Version-Neutral Sparingly:** Only use for true infrastructure endpoints
3. **Document Versions:** Always note the version in Swagger `@ApiTags`
4. **Batch Changes:** When creating v2, make all breaking changes at once
5. **Test Both Versions:** Ensure v1 and v2 coexist without conflicts during transition

### Configuration

Versioning is configured in `apps/api/src/main.ts` using both a global prefix and URI versioning:

```typescript
// Global prefix for all routes, excluding infrastructure endpoints
app.setGlobalPrefix(apiPrefix, {
  exclude: [
    { path: 'health/(.*)', method: RequestMethod.ALL },
    { path: 'health', method: RequestMethod.ALL },
  ],
});

// URI-based versioning (/api/v1/...)
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
  prefix: 'v',
});
```

- `setGlobalPrefix` adds the `/api` prefix to all business routes while excluding infrastructure endpoints (health checks)
- `enableVersioning` adds the `/v1` version segment after the global prefix
- Combined result: `/api/v1/{resource}` for business endpoints, `/health` for infrastructure

---

## Authentication Strategy

### Cookie-Based JWT Authentication

The application uses **HTTP-only cookies** for JWT token management with a **dual-token system**:

| Cookie Name            | Purpose                    | Lifetime | Usage                                                  |
| ---------------------- | -------------------------- | -------- | ------------------------------------------------------ |
| `identityAccessToken`  | User identity verification | 15 min   | Identity-based operations, tenant selection, sys admin |
| `identityRefreshToken` | Identity token renewal     | 14 days  | Used at `/auth/refresh/identity` endpoint              |
| `tenantAccessToken`    | Tenant-scoped API access   | 30 min   | Sent with tenant-specific API requests                 |
| `tenantRefreshToken`   | Tenant token renewal       | 14 days  | Used at `/auth/refresh/tenant` endpoint                |

### Authentication Flow

**Regular User Authentication:**

```
1. Login (POST /auth/login)
   ↓
2. Server sets identityAccessToken + identityRefreshToken cookies
   ↓
3. User selects tenant (POST /auth/tenant-switch)
   ↓
4. Server sets tenantAccessToken + tenantRefreshToken cookies
   ↓
5. Identity tokens remain valid (not cleared)
   ↓
6. Browser automatically sends appropriate tokens with requests
   ↓
7. Tenant access token expires after 30 minutes
   ↓
8. Client calls /auth/refresh/tenant
   ↓
9. Server issues new tenant tokens in cookies
```

**System Admin Authentication:**

```
1. Login (POST /auth/login)
   ↓
2. Server sets identityAccessToken + identityRefreshToken cookies
   ↓
3. System admin can access identity-based endpoints immediately
   ↓
4. Optional: Select tenant for tenant-specific operations
   ↓
5. Receives tenantAccessToken + tenantRefreshToken cookies
```

### Endpoint Authentication

| Decorator                                        | When to Use                                                 | Status Codes           |
| ------------------------------------------------ | ----------------------------------------------------------- | ---------------------- |
| No decorator                                     | Public endpoints (no auth required)                         | -                      |
| `@AuthOptions({ identity: true })`               | Identity-based auth (tenant selection, platform operations) | 401 if unauthenticated |
| `@AuthOptions({ tenant: true })`                 | Tenant-scoped endpoints (tenant operations)                 | 401 if unauthenticated |
| `@AuthOptions({ identity: true, tenant: true })` | Requires both identity and tenant tokens                    | 401 if unauthenticated |

### Authorization Guards

> **📖 Complete RBAC Documentation:** See [RBAC.md](../../../docs/RBAC.md) for comprehensive guide on Tenant and Platform RBAC.

**Tenant RBAC (Tenant-Scoped Operations):**

| Guard + Decorator                                           | When to Use                               | Example                                                              |
| ----------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `TenantPermissionsGuard` + `@RequireAnyTenantPermission()`  | Permission-based access within tenant     | `@RequireAnyTenantPermission('documents:create')`                    |
| `TenantPermissionsGuard` + `@RequireAllTenantPermissions()` | Multiple permissions required (AND logic) | `@RequireAllTenantPermissions('documents:read', 'documents:delete')` |
| `RolesGuard` + `@Roles()`                                   | Simple role check                         | `@Roles('tenant_admin')`                                             |

**Platform RBAC (Platform-Wide Operations):**

| Guard + Decorator                                               | When to Use                               | Example                                                        |
| --------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| `PlatformPermissionsGuard` + `@RequireAnyPlatformPermission()`  | Platform permission check                 | `@RequireAnyPlatformPermission('tenants:create')`              |
| `PlatformPermissionsGuard` + `@RequireAllPlatformPermissions()` | Multiple platform permissions (AND logic) | `@RequireAllPlatformPermissions('tenants:read', 'users:read')` |

**Status Codes:**

- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - Insufficient permissions for the operation

### Swagger Documentation

```typescript
// Public endpoint
@ApiPublicResponses()
@Post('login')
async login() { ... }

// Identity-based endpoint
@AuthOptions({ identity: true })
@SwaggerCookieAuth.identityAccessToken()
@ApiAuthenticatedResponses()
@Get('profile')
async getProfile(@CurrentUserIdentity() identity: AuthenticatedIdentityUser) { ... }

// Tenant-scoped endpoint
@AuthOptions({ tenant: true })
@ApiAuthenticatedResponses()
@Get('documents')
async listDocuments(@CurrentUserTenant() user: AuthenticatedTenantUser) { ... }

// Tenant permission-protected endpoint
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:create')
@ApiProtectedResponses('Requires documents:create permission')
@Post('documents')
async createDocument() { ... }

// Platform permission-protected endpoint
@AuthOptions({ identity: true })
@UseGuards(VerifiedUserGuard)
@ApiProtectedResponses('Requires verified email')
@Post('tenants')
async createTenant() { ... }

// Role-protected endpoint (simple role check)
@AuthOptions({ tenant: true })
@UseGuards(RolesGuard)
@Roles('tenant_admin')
@ApiProtectedResponses('Requires tenant_admin role')
@Post('admin-settings')
async updateAdminSettings() { ... }
```

---

## Complete Signup-to-Operational Flow

This section documents the entire user journey from initial signup to operational access within a tenant.

### Overview

New users follow this 5-step flow:

1. **Register** - Create account (email + password)
2. **Verify** - Confirm email address
3. **Login** - Authenticate and receive identity tokens
4. **Create Organization** - Create first tenant (self-service)
5. **Switch Tenant** - Activate tenant and receive tenant tokens

After completing this flow, users have full tenant access with tenant tokens set as cookies.

### Frontend Integration Notes

- After **Login**: Check if `tenants.length === 0` to determine if user needs onboarding
- After **Create Organization**: Must immediately call **Switch Tenant** to activate the tenant
- **Limbo State**: User is logged in (identity token valid) but not in any tenant (no tenant token) - show onboarding UI
- **Identity Token Lifetime**: 15 minutes - refresh using `/auth/refresh/identity` endpoint
- **Tenant Token Lifetime**: 30 minutes - refresh using `/auth/refresh/tenant` endpoint

### Step 1: Register New User Account

**Endpoint:** `POST /api/v1/auth/signup`

**Authentication:** None (public endpoint)

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Request Schema:**

| Field       | Type   | Required | Validation           | Description        |
| ----------- | ------ | -------- | -------------------- | ------------------ |
| `email`     | string | Yes      | Valid email          | User email address |
| `password`  | string | Yes      | Min 8 chars, max 100 | User password      |
| `firstName` | string | No       | Max 255 chars        | First name         |
| `lastName`  | string | No       | Max 255 chars        | Last name          |

**Response (201 Created):**

```json
{
  "message": "User registered successfully. Verification email sent."
}
```

**Error Responses:**

| Status | Condition                | Response                 |
| ------ | ------------------------ | ------------------------ |
| 400    | Validation failed        | `ValidationErrorDto`     |
| 409    | Email already registered | `ConflictErrorDto`       |
| 500    | Server error             | `InternalServerErrorDto` |

**Behind the Scenes:**

- User account created with email and hashed password
- Email verification token generated
- Verification email sent via Resend (link: `{FRONTEND_URL}/verify-email?token={token}`). Fire-and-forget; signup succeeds even if email fails. In dev without `EMAIL_API_KEY`, log-only mode applies.
- User account is created but **email is not verified** (cannot proceed until verified)

---

### Step 2: Verify Email Address

**Endpoint:** `POST /api/v1/auth/verify-email`

**Authentication:** None (public endpoint)

**Request Body:**

```json
{
  "token": "abc123def456ghi789"
}
```

**Request Schema:**

| Field   | Type   | Required | Description                         |
| ------- | ------ | -------- | ----------------------------------- |
| `token` | string | Yes      | Email verification token from email |

**Response (200 OK):**

```json
{
  "message": "Email verified successfully"
}
```

**Error Responses:**

| Status | Condition             | Response                 |
| ------ | --------------------- | ------------------------ |
| 400    | Invalid/expired token | `ValidationErrorDto`     |
| 500    | Server error          | `InternalServerErrorDto` |

**Behind the Scenes:**

- Verification token validated
- User's `email_verified_at` timestamp updated
- User can now proceed to login and create tenant

---

### Step 3: Login

**Endpoint:** `POST /api/v1/auth/login`

**Authentication:** None (public endpoint)

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Request Schema:**

| Field      | Type   | Required | Description   |
| ---------- | ------ | -------- | ------------- |
| `email`    | string | Yes      | User email    |
| `password` | string | Yes      | User password |

**Response (200 OK):**

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "platformRole": null
  },
  "tenants": [],
  "pendingInvitationsCount": 0
}
```

**Response Schema:**

| Field                     | Type           | Description                                                       |
| ------------------------- | -------------- | ----------------------------------------------------------------- |
| `user.id`                 | UUID           | User unique identifier                                            |
| `user.email`              | string         | User email address                                                |
| `user.firstName`          | string \| null | First name or null                                                |
| `user.lastName`           | string \| null | Last name or null                                                 |
| `user.platformRole`       | string \| null | Platform role (null for regular users, 'system_admin' for admins) |
| `tenants`                 | array          | List of tenants user belongs to (empty array for new users)       |
| `pendingInvitationsCount` | number         | Number of pending tenant invitations                              |

**Cookies Set:**

| Cookie                 | Value | Lifetime | HttpOnly |
| ---------------------- | ----- | -------- | -------- |
| `identityAccessToken`  | JWT   | 15 min   | Yes      |
| `identityRefreshToken` | JWT   | 14 days  | Yes      |

**Error Responses:**

| Status | Condition                                 | Response                 |
| ------ | ----------------------------------------- | ------------------------ |
| 400    | Validation failed                         | `ValidationErrorDto`     |
| 401    | Invalid credentials or email not verified | `UnauthorizedErrorDto`   |
| 500    | Server error                              | `InternalServerErrorDto` |

**Behind the Scenes:**

- Email and password validated
- User's email must be verified (enforced)
- Identity tokens generated (short + long-lived)
- Tokens set as HTTP-only cookies
- List of user's existing tenants returned
- **For new users:** `tenants` array is empty

---

### Step 4: Create Organization (Self-Service)

**Endpoint:** `POST /api/v1/tenants`

**Authentication:** Identity token required (from Step 3)

**Authorization:** User must have verified email

**Request Body:**

```json
{
  "name": "Acme Legal LLC",
  "planKey": "navigator"
}
```

**Request Schema:**

| Field     | Type   | Required | Default                    | Validation             | Description       |
| --------- | ------ | -------- | -------------------------- | ---------------------- | ----------------- |
| `name`    | string | No       | `"{email}'s Organization"` | Max 100 chars          | Organization name |
| `planKey` | enum   | No       | `"navigator"`              | One of valid plan keys | Subscription plan |

**Valid Plan Keys:** `navigator`, `architect`, `infrastructure` (see entitlements documentation for details)

**Response (201 Created):**

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "plan": "navigator",
  "is_active": true,
  "name": "Acme Legal LLC",
  "slug": "acme-legal-llc",
  "locale": "en",
  "timezone": "Asia/Dubai",
  "settings": {},
  "onboarding_metadata": {},
  "created_at": "2026-03-14T10:00:00.000Z",
  "updated_at": "2026-03-14T10:00:00.000Z"
}
```

**Response Schema:**

| Field                 | Type              | Description                                    |
| --------------------- | ----------------- | ---------------------------------------------- |
| `id`                  | UUID              | Tenant unique identifier                       |
| `plan`                | string            | Subscription plan key                          |
| `is_active`           | boolean           | Tenant is active and operational               |
| `name`                | string \| null    | Organization name                              |
| `slug`                | string \| null    | URL-safe identifier (auto-generated from name) |
| `locale`              | string            | Default locale (e.g., 'en', 'ar')              |
| `timezone`            | string            | Default timezone (IANA format)                 |
| `settings`            | object            | Flexible JSONB settings (empty by default)     |
| `onboarding_metadata` | object            | Onboarding state tracking                      |
| `created_at`          | string (ISO 8601) | Creation timestamp                             |
| `updated_at`          | string (ISO 8601) | Last update timestamp                          |

**Error Responses:**

| Status | Condition                              | Response                 |
| ------ | -------------------------------------- | ------------------------ |
| 400    | Validation failed or plan not active   | `BadRequestErrorDto`     |
| 403    | Email not verified                     | `ForbiddenErrorDto`      |
| 404    | Plan not found                         | `NotFoundErrorDto`       |
| 409    | User already owns tenant or name taken | `ConflictErrorDto`       |
| 401    | Missing/invalid identity token         | `UnauthorizedErrorDto`   |
| 500    | Server error                           | `InternalServerErrorDto` |

**Behind the Scenes:**

- **Transaction (all-or-nothing):** Entire operation runs in a single database transaction via `transactionWithPlatformAdminContext`. If any step fails, everything rolls back.
- Tenant created with specified name (or `"{email}'s Organization"` if omitted)
- User linked as `tenant_admin` in `user_tenants` table (within same transaction)
- `tenant_subscriptions` row created atomically within the same transaction:
  - `plan_id` resolved from `planKey` via `PlansRepository.findByKey()`
  - `status` = `'active'`, `current_period_start` = NOW(), `current_period_end` = NOW() + 1 month
  - `getCurrentSubscription(tenantId)` works immediately after creation
- Entitlements resolved lazily on first access (from subscription)
- Default settings applied (locale: `en`, timezone: `Asia/Dubai`)
- Tenant slug is `null` on creation; user can set via `PATCH /tenants/me/slug` later
- **Stripe:** Fire-and-forget customer creation via `StripeCustomerService.createCustomerForTenant()`. Creates Stripe customer with creator email and `metadata.creator_user_id` for traceability. Skips when `STRIPE_SECRET_KEY` is empty or `STRIPE_SKIP_CUSTOMER_CREATION=true`. Never blocks tenant creation.

---

### Step 5: Switch to Tenant (Activate)

**Endpoint:** `POST /api/v1/auth/tenant-switch`

**Authentication:** Identity token required (from Step 3)

**Request Body:**

```json
{
  "tenantId": "11111111-1111-4111-8111-111111111111"
}
```

**Request Schema:**

| Field      | Type | Required | Description            |
| ---------- | ---- | -------- | ---------------------- |
| `tenantId` | UUID | Yes      | Tenant ID to switch to |

**Response (200 OK):**

```json
{
  "tenant": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Acme Legal LLC"
  },
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "role": "tenant_admin",
    "roleName": "Tenant Admin"
  }
}
```

**Response Schema:**

| Field           | Type   | Description                                              |
| --------------- | ------ | -------------------------------------------------------- |
| `tenant.id`     | UUID   | Selected tenant ID                                       |
| `tenant.name`   | string | Organization name                                        |
| `user.id`       | UUID   | User ID                                                  |
| `user.email`    | string | User email                                               |
| `user.role`     | string | User role within tenant (e.g., 'tenant_admin', 'member') |
| `user.roleName` | string | Role display name                                        |

**Cookies Set:**

| Cookie                 | Value     | Lifetime    | HttpOnly |
| ---------------------- | --------- | ----------- | -------- |
| `tenantAccessToken`    | JWT       | 30 min      | Yes      |
| `tenantRefreshToken`   | JWT       | 14 days     | Yes      |
| `identityAccessToken`  | Unchanged | Still valid | Yes      |
| `identityRefreshToken` | Unchanged | Still valid | Yes      |

**Error Responses:**

| Status | Condition                      | Response                 |
| ------ | ------------------------------ | ------------------------ |
| 400    | Validation failed              | `ValidationErrorDto`     |
| 401    | Missing/invalid identity token | `UnauthorizedErrorDto`   |
| 403    | User doesn't belong to tenant  | `ForbiddenErrorDto`      |
| 404    | Tenant not found               | `NotFoundErrorDto`       |
| 500    | Server error                   | `InternalServerErrorDto` |

**Behind the Scenes:**

- User's membership in specified tenant validated
- Tenant access permissions verified
- Tenant tokens generated (short + long-lived)
- Tokens set as HTTP-only cookies
- Identity tokens remain valid (user still authenticated)
- Both identity and tenant contexts available to subsequent requests

---

### Complete Flow Example

```
USER JOURNEY:
1. Frontend calls POST /auth/signup
   ↓ User receives verification email
2. User clicks link, Frontend extracts token
3. Frontend calls POST /auth/verify-email with token
   ↓ Email verified
4. Frontend calls POST /auth/login
   ↓ Identity tokens set as cookies, response shows tenants: []
5. Frontend detects empty tenants array, shows "Create Organization" form
6. Frontend calls POST /tenants with name + plan
   ↓ Tenant created, subscription started
7. Frontend calls POST /auth/tenant-switch with tenantId
   ↓ Tenant tokens set as cookies
8. Frontend shows main app - user now has full tenant access
   ↓ Subsequent requests use tenantAccessToken automatically (browser sends cookies)
```

---

## Request Contracts

### DTO Types

| Type          | Naming Pattern                                 | Purpose                 | Example              |
| ------------- | ---------------------------------------------- | ----------------------- | -------------------- |
| **Body DTO**  | `Create{Resource}Dto`, `Update{Resource}Dto`   | Request body validation | `CreateTemplateDto`  |
| **Query DTO** | `{Resource}QueryDto`, `List{Resource}QueryDto` | Query string parameters | `TemplateQueryDto`   |
| **Param DTO** | `{Resource}IdParamDto`, `UuidParamDto`         | Path parameters         | `TemplateIdParamDto` |

### Body DTOs

Use for `POST`, `PUT`, `PATCH` request bodies:

```typescript
export class CreateTemplateDto {
  @ApiProperty({
    description: 'Template name',
    example: 'Employment Contract',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Template description',
    example: 'Standard employment contract template',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Template status',
    enum: ['active', 'inactive', 'draft'],
    default: 'draft',
  })
  @IsEnum(['active', 'inactive', 'draft'])
  status: string;
}
```

### Query DTOs

Use for filtering, searching, and pagination:

```typescript
export class ListTemplatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['active', 'inactive', 'draft'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'draft'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Search by name or description',
    example: 'employment',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
```

### Param DTOs

Use for path parameters:

```typescript
export class TemplateIdParamDto {
  @ApiProperty({
    description: 'Template UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  templateId: string;
}
```

### Required vs Optional Fields

```typescript
// Required field
@ApiProperty({ ... })
@IsString()
@IsNotEmpty()
fieldName: string;

// Optional field
@ApiPropertyOptional({ ... })
@IsOptional()
@IsString()
fieldName?: string;

// Optional with default
@ApiPropertyOptional({ default: 'draft' })
@IsOptional()
@IsEnum(['active', 'draft'])
status?: string = 'draft';
```

---

## Response Contracts

### Response DTO Requirements

Every endpoint must have an explicit response DTO:

```typescript
export class GetTemplateResponseDto {
  @ApiProperty({
    description: 'Template unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Template name',
    example: 'Employment Contract',
  })
  name: string;

  @ApiProperty({
    description: 'Created timestamp',
    example: '2026-01-21T10:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2026-01-21T12:30:00.000Z',
  })
  updatedAt: string;
}
```

### Standard Response Types

| Type             | When to Use                  | Example                                        |
| ---------------- | ---------------------------- | ---------------------------------------------- |
| **Resource DTO** | Returning single resource    | `GetTemplateResponseDto`                       |
| **List DTO**     | Returning multiple resources | `PaginatedResponseDto<GetTemplateResponseDto>` |
| **Message DTO**  | Simple confirmation          | `MessageResponseDto`                           |
| **Nested DTO**   | Resource with relations      | `TemplateWithVersionsResponseDto`              |

### Paginated Responses

Use `PaginatedResponseDto` for list endpoints:

```typescript
@Get()
@ApiListResponses(PaginatedResponseDto, 'Templates')
@ApiResponse({
  status: 200,
  description: 'Templates retrieved successfully',
  schema: {
    allOf: [
      {
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(GetTemplateResponseDto) },
          },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    ],
  },
})
async list(@Query() query: ListTemplatesQueryDto): Promise<PaginatedResponseDto<GetTemplateResponseDto>> {
  // Implementation
}
```

### Timestamp Fields

All timestamps should be:

- **Format:** ISO 8601 string (`YYYY-MM-DDTHH:mm:ss.sssZ`)
- **Type:** `string` (not `Date` object)
- **Example:** `2026-01-21T10:30:00.000Z`

```typescript
@ApiProperty({
  description: 'Created timestamp',
  example: '2026-01-21T10:00:00.000Z',
  type: 'string',
  format: 'date-time',
})
createdAt: string;
```

---

## Error Handling

### Standard Error Shape

All errors use `ErrorResponseDto`:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-01-21T10:30:00.000Z",
  "path": "/api/templates"
}
```

### HTTP Status Codes

| Code    | Type         | When to Use                        | DTO                      |
| ------- | ------------ | ---------------------------------- | ------------------------ |
| **200** | Success      | Successful GET, PUT, PATCH, DELETE | Resource DTO             |
| **201** | Created      | POST that creates a resource       | Resource DTO             |
| **202** | Accepted     | POST that enqueues async work      | DTO with jobId, etc.     |
| **400** | Bad Request  | Validation failed                  | `ValidationErrorDto`     |
| **401** | Unauthorized | Missing/invalid authentication     | `UnauthorizedErrorDto`   |
| **403** | Forbidden    | Insufficient permissions           | `ForbiddenErrorDto`      |
| **404** | Not Found    | Resource doesn't exist             | `NotFoundErrorDto`       |
| **409** | Conflict     | Resource already exists            | `ConflictErrorDto`       |
| **500** | Server Error | Unexpected server error            | `InternalServerErrorDto` |

### Documenting Errors

```typescript
@Post()
@ApiOperation({ summary: 'Create template' })
@ApiResponse({
  status: 201,
  description: 'Template created successfully',
  type: GetTemplateResponseDto,
})
@ApiValidationError() // 400
@ApiConflictError('Template with this key already exists') // 409
@ApiProtectedResponses() // 401, 403, 500
async create(@Body() dto: CreateTemplateDto) { ... }
```

For async endpoints (job enqueued, processing elsewhere):

```typescript
@Post(':key/ingest')
@HttpCode(HttpStatus.ACCEPTED)
@ApiResponse({
  status: 202,
  description: 'Ingestion job enqueued',
  schema: { properties: { message: {}, jobId: {}, versionId: {} } },
})
async ingest(@Param() params: RulesetKeyParamDto) { ... }
```

For create/update responses that trigger background ingestion (e.g. ruleset create, version create, rollback), include `ingestionStatus: 'enqueued' | 'failed'` so callers know if the job was enqueued. Creation still succeeds on enqueue failure; use the manual ingest endpoint to retry.

---

## Naming Conventions

### Files

```
{feature}/
├── {feature}.controller.ts
├── {feature}.service.ts
├── {feature}.module.ts
└── dto/
    ├── create-{feature}.dto.ts
    ├── update-{feature}.dto.ts
    ├── {feature}-query.dto.ts
    ├── {feature}-response.dto.ts
    └── {feature}-param.dto.ts
```

### DTOs

| Type          | Pattern                                          | Example                    |
| ------------- | ------------------------------------------------ | -------------------------- |
| Create        | `Create{Resource}Dto`                            | `CreateTemplateDto`        |
| Update        | `Update{Resource}Dto`                            | `UpdateTemplateDto`        |
| Response      | `{Resource}ResponseDto`                          | `GetTemplateResponseDto`   |
| List Response | `{Resource}ListResponseDto`                      | `ListTemplatesResponseDto` |
| Query         | `{Resource}QueryDto` or `List{Resource}QueryDto` | `TemplateQueryDto`         |
| Param         | `{Resource}IdParamDto`                           | `TemplateIdParamDto`       |

### Properties

- **Use camelCase** for all property names
- **Boolean fields** start with `is`, `has`, `can`
- **Date fields** end with `At` (e.g., `createdAt`, `updatedAt`)
- **ID fields** end with `Id` (e.g., `userId`, `tenantId`)

---

## Swagger Documentation

### Controller Level

```typescript
@ApiTags('Templates')
@Controller('templates')
@SwaggerCookieAuth.tenantAccessToken()
export class TemplatesController {
  // Routes
}
```

**Note:** Authentication is now specified per-endpoint using `@AuthOptions()` decorator, not at controller level.

### Endpoint Level

```typescript
@Get(':id')
@ApiOperation({
  summary: 'Get template by ID',
  description: 'Retrieve a single template with all its details including version history',
})
@ApiParam({
  name: 'id',
  description: 'Template UUID',
  example: '550e8400-e29b-41d4-a716-446655440000',
})
@ApiGetResponses(GetTemplateResponseDto, 'Template')
async findOne(@Param() params: TemplateIdParamDto): Promise<GetTemplateResponseDto> {
  // Implementation
}
```

### Complete Example

```typescript
@Post()
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('templates:manage')
@ApiOperation({
  summary: 'Create a new template',
  description: 'Create a new document template. Requires templates:manage permission.',
})
@ApiCreateResponses(GetTemplateResponseDto, 'Template')
@ApiConflictError('Template with this key already exists')
async create(
  @Body() dto: CreateTemplateDto,
  @CurrentUserTenant() user: AuthenticatedTenantUser,
): Promise<GetTemplateResponseDto> {
  // Implementation
}
```

---

## Examples

### Complete CRUD Controller

See `src/modules/templates/templates.controller.ts` for a complete example.

### Simple Resource

```typescript
// DTO
export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Employment' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CategoryResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Employment' })
  name: string;

  @ApiProperty({ example: '2026-01-21T10:00:00.000Z' })
  createdAt: string;
}

// Controller
@ApiTags('Categories')
@Controller('categories')
@SwaggerCookieAuth.IdentityAccessToken()
export class CategoriesController {
  @Get()
  @AuthOptions({ identity: true })
  @ApiListResponses(PaginatedResponseDto, 'Categories')
  async list(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<PaginatedResponseDto<CategoryResponseDto>> {
    // Implementation
  }

  @Post()
  @AuthOptions({ tenant: true })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('templates:manage')
  @ApiCreateResponses(CategoryResponseDto, 'Category')
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<CategoryResponseDto> {
    // Implementation
  }
}
```

---

## Common DTOs Reference

Available in `src/common/dto/`:

- `ErrorResponseDto` - Standard error shape
- `MessageResponseDto` - Simple message response
- `PaginationQueryDto` - Pagination query parameters
- `PaginatedResponseDto<T>` - Paginated response wrapper
- `UuidParamDto` - UUID path parameter validation

Available decorators in `src/common/swagger/decorators.ts`:

- `@ApiStandardErrors()` - 500 error
- `@ApiAuthErrors()` - 401 error
- `@ApiForbiddenError()` - 403 error
- `@ApiNotFoundError()` - 404 error
- `@ApiValidationError()` - 400 error
- `@ApiAuthenticatedResponses()` - 401, 500
- `@ApiProtectedResponses()` - 401, 403, 500
- `@ApiCreateResponses()` - Create operation responses
- `@ApiGetResponses()` - Get operation responses
- `@ApiListResponses()` - List operation responses
- `@ApiUpdateResponses()` - Update operation responses
- `@ApiDeleteResponses()` - Delete operation responses

---

## Checklist for New Endpoints

- [ ] Request DTO defined with validation decorators
- [ ] Response DTO defined with all fields
- [ ] `@ApiOperation()` with summary and description
- [ ] Success response documented with `@ApiResponse()`
- [ ] Error responses documented (400, 401, 403, 404, 409, 500)
- [ ] Authentication specified with `@AuthOptions()` decorator
- [ ] Permission guards applied if needed (`@RequirePermissions()` + `TenantPermissionsGuard` or `@Roles()` + `RolesGuard`)
- [ ] Query parameters documented (`@ApiQuery()` or query DTO)
- [ ] Path parameters documented (`@ApiParam()` or param DTO)
- [ ] Request body documented (`@ApiBody()` if needed)
- [ ] Controller has `@ApiTags()` decorator

---

## References

- [NestJS Swagger Documentation](https://docs.nestjs.com/openapi/introduction)
- [OpenAPI Specification](https://swagger.io/specification/)
- [class-validator Documentation](https://github.com/typestack/class-validator)

---

**For questions or clarifications, refer to existing examples in:**

- `src/modules/auth/auth.controller.ts` - Authentication endpoints
- `src/modules/tenants/invitations.controller.ts` - Invitation management
- `src/modules/storage/storage.controller.ts` - File upload/download
- `src/modules/templates/templates.controller.ts` - Complex CRUD operations
- `src/modules/entitlements/controllers/addon-catalog.controller.ts` - Public catalog endpoints
- `src/modules/entitlements/controllers/tenant-addons.controller.ts` - Tenant-scoped add-on management
- `src/modules/entitlements/controllers/tenant-overrides.controller.ts` - Platform admin overrides

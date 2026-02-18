# API Contracts Documentation

> **Purpose:** Define standards and conventions for API contract definition across all modules

**Last Updated:** February 3, 2026
**Status:** Foundation Complete

---

## Table of Contents

- [Overview](#overview)
- [Authentication Strategy](#authentication-strategy)
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

| Decorator | When to Use | Status Codes |
|-----------|-------------|--------------|
| No decorator | Public endpoints (no auth required) | - |
| `@AuthOptions({ identity: true })` | Identity-based auth (tenant selection, platform operations) | 401 if unauthenticated |
| `@AuthOptions({ tenant: true })` | Tenant-scoped endpoints (tenant operations) | 401 if unauthenticated |
| `@AuthOptions({ identity: true, tenant: true })` | Requires both identity and tenant tokens | 401 if unauthenticated |

### Authorization Guards

> **📖 Complete RBAC Documentation:** See [RBAC.md](../../../docs/RBAC.md) for comprehensive guide on Tenant and Platform RBAC.

**Tenant RBAC (Tenant-Scoped Operations):**

| Guard + Decorator | When to Use | Example |
|-------------------|-------------|---------|
| `TenantPermissionsGuard` + `@RequireAnyTenantPermission()` | Permission-based access within tenant | `@RequireAnyTenantPermission('documents:create')` |
| `TenantPermissionsGuard` + `@RequireAllTenantPermissions()` | Multiple permissions required (AND logic) | `@RequireAllTenantPermissions('documents:read', 'documents:delete')` |
| `RolesGuard` + `@Roles()` | Simple role check | `@Roles('tenant_admin')` |

**Platform RBAC (Platform-Wide Operations):**

| Guard + Decorator | When to Use | Example |
|-------------------|-------------|---------|
| `PlatformPermissionsGuard` + `@RequireAnyPlatformPermission()` | Platform permission check | `@RequireAnyPlatformPermission('tenants:create')` |
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
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('tenants:create')
@ApiProtectedResponses('Requires tenants:create permission')
@Post('admin/tenants')
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
| **201** | Created      | Successful POST                    | Resource DTO             |
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

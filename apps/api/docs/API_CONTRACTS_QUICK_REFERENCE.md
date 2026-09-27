# API Contracts - Quick Reference

> **TL;DR:** Copy-paste examples for common API contract patterns

**Authentication Note:** This API uses a dual-token authentication flow with four token types:

- `identityAccessToken` - Short-lived token for user identity verification and system admin operations
- `identityRefreshToken` - Long-lived token for renewing identity access tokens
- `tenantAccessToken` - Short-lived token for tenant-scoped API access
- `tenantRefreshToken` - Long-lived token for renewing tenant access tokens

> Token lifetimes are configured via environment variables (`JWT_*_EXPIRES_IN`).

---

## Import Statements

```typescript
// Controller imports
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

// Common DTOs
import {
  PaginationQueryDto,
  PaginatedResponseDto,
  MessageResponseDto,
  UuidParamDto,
} from '../../../../common/dto';

// Swagger helpers
import {
  SwaggerCookieAuth,
  ApiAuthenticatedResponses,
  ApiProtectedResponses,
  ApiCreateResponses,
  ApiGetResponses,
  ApiListResponses,
  ApiUpdateResponses,
  ApiDeleteResponses,
  ApiValidationError,
  ApiNotFoundError,
  ApiConflictError,
} from 'src/common/swagger';

// Auth decorators
import { AuthOptions } from 'src/modules/auth/decorators/auth-options.decorator';
import {
  CurrentUserTenant,
  CurrentUserIdentity,
} from 'src/modules/auth/decorators/current-user.decorator';

// Permission decorators (RBAC)
import {
  RequireAllTenantPermissions,
  RequireAnyTenantPermission,
} from 'src/common/decorators/permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/permissions.guard';
import { VerifiedUserGuard } from 'src/common/guards/verified-user.guard';

// Role decorators (simple role checks)
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
```

---

## Controller Template

```typescript
@ApiTags('Resources')
@Controller('resources')
@SwaggerCookieAuth.tenantAccessToken()
export class ResourcesController {
  constructor(private readonly service: ResourceService) {}

  // Endpoints here
}
```

---

## Endpoint Patterns

### 1. List (GET /resources)

```typescript
@Get()
@AuthOptions({ tenant: true })
@ApiOperation({
  summary: 'List all resources',
  description: 'Retrieve a paginated list of resources with optional filtering',
})
@ApiListResponses(PaginatedResponseDto, 'Resources')
async list(
  @Query() query: ListResourceQueryDto,
  @CurrentUserTenant() user: AuthenticatedTenantUser,
): Promise<PaginatedResponseDto<ResourceResponseDto>> {
  // Implementation
  return;
}
```

### 2. Get by ID (GET /resources/:id)

```typescript
@Get(':id')
@AuthOptions({ tenant: true })
@ApiOperation({
  summary: 'Get resource by ID',
  description: 'Retrieve a single resource by its UUID',
})
@ApiParam({
  name: 'id',
  description: 'Resource UUID',
  example: '550e8400-e29b-41d4-a716-446655440000',
})
@ApiGetResponses(ResourceResponseDto, 'Resource')
async findOne(
  @Param() params: ResourceIdParamDto,
  @CurrentUserTenant() user: AuthenticatedTenantUser,
): Promise<ResourceResponseDto> {
  // Implementation
  return;
}
```

### 3. Create (POST /resources)

```typescript
@Post()
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:create')
@ApiOperation({
  summary: 'Create a new resource',
  description: 'Create a new resource. Requires documents:create permission.',
})
@ApiCreateResponses(ResourceResponseDto, 'Resource')
@ApiConflictError('Resource already exists')
async create(
  @Body() dto: CreateResourceDto,
  @CurrentUserTenant() user: AuthenticatedTenantUser,
): Promise<ResourceResponseDto> {
  // Implementation
  return;
}
```

### 3a. Create Self-Service Tenant (Identity-Based POST)

```typescript
@Post('tenants')
@AuthOptions({ identity: true })
@UseGuards(VerifiedUserGuard)
@ApiOperation({
  summary: 'Create a new tenant (organization)',
  description: 'Self-service tenant creation for verified users. Requires identity token and verified email.',
})
@ApiCreateResponses(TenantResponseDto, 'Tenant')
@ApiForbiddenError('Email not verified')
@ApiConflictError('User already has a tenant')
@ApiNotFoundError('Plan not found')
async createTenant(
  @Body() dto: CreateTenantDto,
  @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
): Promise<TenantResponseDto> {
  // Implementation
  return;
}
```

### 4. Update (PATCH /resources/:id)

```typescript
@Patch(':id')
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:create')
@ApiOperation({
  summary: 'Update resource',
  description: 'Update an existing resource. Requires documents:create permission.',
})
@ApiParam({
  name: 'id',
  description: 'Resource UUID',
  example: '550e8400-e29b-41d4-a716-446655440000',
})
@ApiUpdateResponses(ResourceResponseDto, 'Resource')
async update(
  @Param() params: ResourceIdParamDto,
  @Body() dto: UpdateResourceDto,
  @CurrentUserTenant() user: AuthenticatedTenantUser,
): Promise<ResourceResponseDto> {
  // Implementation
  return;
}
```

### 5. Delete (DELETE /resources/:id)

```typescript
@Delete(':id')
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAllTenantPermissions('documents:read', 'documents:delete')
@ApiOperation({
  summary: 'Delete resource',
  description: 'Permanently delete a resource. Requires documents:read and documents:delete permissions.',
})
@ApiParam({
  name: 'id',
  description: 'Resource UUID',
  example: '550e8400-e29b-41d4-a716-446655440000',
})
@ApiDeleteResponses('Resource')
async remove(
  @Param() params: ResourceIdParamDto,
  @CurrentUserTenant() user: AuthenticatedTenantUser,
): Promise<MessageResponseDto> {
  // Implementation
  return { message: 'Resource deleted successfully' };
}
```

### 6. Public Endpoint (No Auth)

```typescript
@Get('public')
@ApiOperation({
  summary: 'Public endpoint',
  description: 'This endpoint does not require authentication',
})
@ApiResponse({
  status: 200,
  description: 'Success',
  type: ResourceResponseDto,
})
@ApiStandardErrors()
async publicEndpoint(): Promise<ResourceResponseDto> {
  // Implementation
  return;
}
```

### 7. Platform Admin Endpoint (Identity Token)

```typescript
@Get('admin/system-stats')
@AuthOptions({ identity: true })
@UseGuards(PlatformTenantPermissionsGuard)
@RequireAnyPlatformPermission('audit:read')
@ApiOperation({
  summary: 'Get system statistics',
  description: 'Retrieve system-wide statistics. Requires system admin role.',
})
@ApiGetResponses(SystemStatsDto, 'System statistics')
async getSystemStats(
  @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
): Promise<SystemStatsDto> {
  // Implementation
  return;
}
```

### 8. Tenant Admin Only (Simple Role Check)

```typescript
@Post('admin-settings')
@AuthOptions({ tenant: true })
@UseGuards(RolesGuard)
@Roles('tenant_admin')
@ApiOperation({
  summary: 'Update admin settings',
  description: 'Update tenant admin settings. Requires tenant_admin role.',
})
@ApiUpdateResponses(SettingsResponseDto, 'Settings')
async updateAdminSettings(
  @Body() dto: UpdateSettingsDto,
  @CurrentUserTenant() user: AuthenticatedTenantUser,
): Promise<SettingsResponseDto> {
  // Implementation
  return;
}
```

---

## DTO Templates

### Create DTO

```typescript
export class CreateResourceDto {
  @ApiProperty({
    description: 'Resource name',
    example: 'My Resource',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Resource description',
    example: 'A detailed description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Resource status',
    enum: ['active', 'inactive'],
    default: 'active',
  })
  @IsEnum(['active', 'inactive'])
  status: string;
}
```

### Update DTO

```typescript
export class UpdateResourceDto {
  @ApiPropertyOptional({
    description: 'Resource name',
    example: 'Updated Name',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Resource description',
    example: 'Updated description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Resource status',
    enum: ['active', 'inactive'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}
```

### Response DTO

```typescript
export class ResourceResponseDto {
  @ApiProperty({
    description: 'Resource unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Resource name',
    example: 'My Resource',
  })
  name: string;

  @ApiProperty({
    description: 'Resource description',
    example: 'A detailed description',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Resource status',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  status: string;

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

### Query DTO (with pagination)

```typescript
export class ListResourceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['active', 'inactive'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Search by name',
    example: 'employment',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
```

### Param DTO

```typescript
export class ResourceIdParamDto {
  @ApiProperty({
    description: 'Resource UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  id: string;
}
```

---

## Common Validation Decorators

```typescript
// Strings
@IsString()
@IsNotEmpty()
@MinLength(3)
@MaxLength(255)

// Numbers
@IsNumber()
@Min(1)
@Max(100)

// Emails
@IsEmail()

// UUIDs
@IsUUID('4')

// Enums
@IsEnum(['active', 'inactive', 'draft'])

// Booleans
@IsBoolean()

// Dates
@IsDateString()
@IsISO8601()

// Arrays
@IsArray()
@ArrayMinSize(1)
@ArrayMaxSize(10)

// Nested objects
@ValidateNested()
@Type(() => NestedDto)

// Optional fields
@IsOptional()
```

---

## Response Status Codes

| Method    | Success    | Error Scenarios         |
| --------- | ---------- | ----------------------- |
| GET       | 200        | 401, 403, 404, 500      |
| POST      | 201 or 202 | 400, 401, 403, 409, 500 |
| PUT/PATCH | 200     | 400, 401, 403, 404, 500 |
| DELETE    | 200     | 401, 403, 404, 500      |

---

## File Structure

```
modules/resource/
├── resource.controller.ts
├── resource.service.ts
├── resource.module.ts
└── dto/
    ├── create-resource.dto.ts
    ├── update-resource.dto.ts
    ├── resource-response.dto.ts
    ├── resource-query.dto.ts
    └── resource-param.dto.ts
```

---

## Testing in Swagger

1. Start the server: `pnpm start:dev`
2. Open Swagger: `http://localhost:3000/docs`
3. Authorize with cookie (after login)
4. Test endpoints

---

## Common Pitfalls

❌ **Don't:**

- Use `any` type
- Forget `@ApiProperty()` decorators
- Miss error response documentation
- Skip validation decorators
- Use implicit authentication

✅ **Do:**

- Define explicit response DTOs
- Document all status codes
- Use type-safe enums
- Apply consistent naming
- Add descriptions to all fields

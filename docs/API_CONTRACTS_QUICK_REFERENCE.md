# API Contracts - Quick Reference

> **TL;DR:** Copy-paste examples for common API contract patterns

**Authentication Note:** This API uses a multi-step authentication flow with three token types:

- `identityToken` - Short-lived (10 min) token after login, used for tenant selection
- `accessToken` - Standard API access token (30 min), issued after tenant selection
- `refreshToken` - Long-lived token (14 days) for obtaining new access tokens

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
} from 'src/common/dto';

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
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
```

---

## Controller Template

```typescript
@ApiTags('Resources')
@Controller('resources')
@SwaggerCookieAuth.accessToken()
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
@ApiOperation({
  summary: 'List all resources',
  description: 'Retrieve a paginated list of resources with optional filtering',
})
@ApiListResponses(PaginatedResponseDto, 'Resources')
async list(
  @Query() query: ListResourceQueryDto,
): Promise<PaginatedResponseDto<ResourceResponseDto>> {
  // Implementation
  return;
}
```

### 2. Get by ID (GET /resources/:id)

```typescript
@Get(':id')
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
): Promise<ResourceResponseDto> {
  // Implementation
  return;
}
```

### 3. Create (POST /resources)

```typescript
@Post()
@UseGuards(RolesGuard)
@Roles('admin', 'member')
@ApiOperation({
  summary: 'Create a new resource',
  description: 'Create a new resource. Requires admin or member role.',
})
@ApiCreateResponses(ResourceResponseDto, 'Resource')
@ApiConflictError('Resource already exists')
async create(
  @Body() dto: CreateResourceDto,
  @CurrentUser() user: AuthenticatedUser,
): Promise<ResourceResponseDto> {
  // Implementation
  return;
}
```

### 4. Update (PATCH /resources/:id)

```typescript
@Patch(':id')
@UseGuards(RolesGuard)
@Roles('admin', 'member')
@ApiOperation({
  summary: 'Update resource',
  description: 'Update an existing resource. Requires admin or member role.',
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
  @CurrentUser() user: AuthenticatedUser,
): Promise<ResourceResponseDto> {
  // Implementation
  return;
}
```

### 5. Delete (DELETE /resources/:id)

```typescript
@Delete(':id')
@UseGuards(RolesGuard)
@Roles('admin')
@ApiOperation({
  summary: 'Delete resource',
  description: 'Permanently delete a resource. Requires admin role.',
})
@ApiParam({
  name: 'id',
  description: 'Resource UUID',
  example: '550e8400-e29b-41d4-a716-446655440000',
})
@ApiDeleteResponses('Resource')
async remove(
  @Param() params: ResourceIdParamDto,
  @CurrentUser() user: AuthenticatedUser,
): Promise<MessageResponseDto> {
  // Implementation
  return { message: 'Resource deleted successfully' };
}
```

### 6. Public Endpoint (No Auth)

```typescript
@Public()
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

| Method    | Success | Error Scenarios         |
| --------- | ------- | ----------------------- |
| GET       | 200     | 401, 403, 404, 500      |
| POST      | 201     | 400, 401, 403, 409, 500 |
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

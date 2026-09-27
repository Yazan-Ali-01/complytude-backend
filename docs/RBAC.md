# Role-Based Access Control (RBAC) Documentation

Comprehensive guide to the dual-level RBAC system in Complytude: **Tenant RBAC** and **Platform RBAC**.

**Last Updated:** February 18, 2026  
**Status:** Production Ready

---

## Table of Contents

- [Overview](#overview)
- [RBAC Architecture](#rbac-architecture)
- [Tenant RBAC](#tenant-rbac)
- [Platform RBAC](#platform-rbac)
- [Permission Format](#permission-format)
- [Wildcard Permissions](#wildcard-permissions)
- [Implementation Guide](#implementation-guide)
- [Database Schema](#database-schema)
- [Automatic Synchronization](#automatic-synchronization)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

Complytude implements a **dual-level RBAC system** to handle authorization at two distinct scopes:

| RBAC Level | Scope | Authentication | Use Case |
|------------|-------|----------------|----------|
| **Tenant RBAC** | Tenant-specific operations | Tenant Token | User access within a specific tenant (documents, templates, team management) |
| **Platform RBAC** | Platform-wide operations | Identity Token | System administration (tenant management, global templates, plans, subscriptions) |

### Key Concepts

- **Tenant RBAC**: Controls what users can do **within a tenant** (e.g., create documents, manage team members)
- **Platform RBAC**: Controls what users can do **across the platform** (e.g., create tenants, manage global templates, view all subscriptions)
- **Permissions**: Granular access rights following `{resource}:{action}` format
- **Roles**: Collections of permissions (system roles are in-memory for performance, custom roles in database)
- **Wildcards**: Support for `*` in resource or action for flexible permission sets

---

## RBAC Architecture

### Dual-Level Authorization

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Authentication                         │
│                                                                  │
│  Login → Identity Token (identityAccessToken cookie)            │
│       → Tenant Selection → Tenant Token (tenantAccessToken)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Authorization Layer                           │
│                                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │     Platform RBAC        │  │      Tenant RBAC         │    │
│  │  (Identity Token)        │  │   (Tenant Token)         │    │
│  │                          │  │                          │    │
│  │  • Tenant management     │  │  • Document operations   │    │
│  │  • Global templates      │  │  • Team management       │    │
│  │  • Plans & subscriptions │  │  • Tenant settings       │    │
│  │  • System administration │  │  • Template usage        │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Global Module Architecture

Both RBAC systems are implemented as **Global Modules** (`@Global()` decorator):

- **TenantRbacModule** - Automatically available in all feature modules
- **PlatformRbacModule** - Automatically available in all feature modules

**Why Global?**
- RBAC is a cross-cutting concern (like authentication)
- Guards are used across many feature modules
- Eliminates need to import RBAC modules in every feature
- Follows NestJS best practices for authorization systems

**Usage:**
```typescript
// ✅ CORRECT: No RBAC module import needed
@Module({
  controllers: [MyController], // Uses guards directly
})
export class MyModule {}

// ❌ WRONG: Don't import RBAC modules in feature modules
@Module({
  imports: [TenantRbacModule], // ← Not needed! It's global
  controllers: [MyController],
})
export class MyModule {}
```

---

## Tenant RBAC

**Scope:** Controls access within a specific tenant  
**Authentication:** Requires tenant token (`tenantAccessToken` cookie)  
**Use Cases:** Document management, team operations, tenant settings

### Tenant System Roles

Four predefined system roles with in-memory permission sets for optimal performance:

| Role | Key | Permissions | Description |
|------|-----|-------------|-------------|
| **Tenant Admin** | `tenant_admin` | `*:*` | Full access to all tenant features |
| **Legal Counsel** | `legal_counsel` | `documents:*`, `contracts:*`, `templates:*`, `regulatory:query` | AI drafting, analysis, templates, regulatory queries |
| **Member** | `member` | `documents:create`, `documents:read`, `templates:use`, `regulatory:query` | Basic document creation and viewing |
| **Viewer** | `viewer` | `documents:read`, `regulatory:query` | Read-only access |

**Note:** System roles use wildcards (e.g., `documents:*`) for cleaner permission sets. Permission matching handles wildcard expansion at runtime.

### Tenant Permissions

Permissions follow the pattern: `{resource}:{action}`

**Available Resources:**
- `documents` - Document management
- `contracts` - Contract analysis
- `templates` - Template management
- `regulatory` - Regulatory queries
- `billing` - Billing management
- `team` - Team management
- `settings` - Tenant settings

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

### Tenant RBAC Implementation

#### Decorators

```typescript
import {
  RequireAllTenantPermissions,
  RequireAnyTenantPermission,
} from 'src/common/decorators/permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/permissions.guard';
```

#### Usage Examples

```typescript
// Require ANY of the specified permissions (OR logic)
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:read', 'templates:use')
@Get()
async listResources(@CurrentUserTenant() user: AuthenticatedTenantUser) {
  // User needs either documents:read OR templates:use
}

// Require ALL specified permissions (AND logic)
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAllTenantPermissions('documents:read', 'documents:delete')
@Delete(':id')
async deleteDocument(@CurrentUserTenant() user: AuthenticatedTenantUser) {
  // User needs BOTH documents:read AND documents:delete
}

// Wildcard permission
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
@RequireAnyTenantPermission('documents:*')
@Post()
async createDocument(@CurrentUserTenant() user: AuthenticatedTenantUser) {
  // User needs any document permission (create, read, delete, etc.)
}

// Simple role check (alternative approach)
@AuthOptions({ tenant: true })
@UseGuards(RolesGuard)
@Roles('tenant_admin')
@Post('admin-only')
async adminOnlyAction(@CurrentUserTenant() user: AuthenticatedTenantUser) {
  // Only tenant_admin role allowed
}
```

### Tenant Permission Check Flow

```
Request → JWT Guard (Tenant Token)
  → Extract tenant role from token
  → TenantPermissionsGuard
  → TenantRbacService.hasPermission()
  → System role: In-memory lookup (O(1))
  → Custom role: Database query
  → Permission matcher (wildcard support)
  → Allow/Deny
```

### Key Files (Tenant RBAC)

- `src/common/constants/tenant-permissions.constant.ts` - Permission definitions (source of truth)
- `src/common/constants/tenant-system-roles.constant.ts` - System role permissions (in-memory)
- `src/common/decorators/permissions.decorator.ts` - Permission decorators
- `src/common/guards/permissions.guard.ts` - Permission guard
- `src/common/utils/tenant-permission-matcher.util.ts` - Wildcard matching
- `src/modules/tenant-rbac/tenant-rbac.service.ts` - RBAC business logic
- `src/modules/tenant-rbac/tenant-rbac-sync.service.ts` - Database sync (on startup)
- `src/repositories/tenant-rbac/` - Tenant RBAC repositories

---

## Platform RBAC

**Scope:** Controls access to platform-wide operations  
**Authentication:** Requires identity token (`identityAccessToken` cookie)  
**Use Cases:** System administration, tenant management, global resource management

### Platform System Roles

Three predefined system roles with in-memory permission sets:

| Role | Key | Permissions | Description |
|------|-----|-------------|-------------|
| **System Admin** | `system_admin` | `*:*` | Full access to all platform features |
| **Support** | `support` | `tenants:read`, `users:read`, `plans:read`, `subscriptions:read`, `templates:read`, `rulesets:read`, `authorities:read`, `categories:read`, `entitlements:read`, `audit:read`, `support:access` | Read-only support access |
| **Auditor** | `auditor` | `tenants:read`, `users:read`, `audit:read`, `entitlements:read` | Audit and compliance read-only access |

### Platform Permissions

Permissions follow the pattern: `{resource}:{action}`

**Available Resources:**
- `tenants` - Tenant management
- `users` - User management (platform-wide)
- `plans` - Plan catalog management
- `subscriptions` - Subscription management
- `templates` - Global template management
- `rulesets` - Compliance ruleset management
- `authorities` - Regulatory authority management
- `categories` - Template category management
- `entitlements` - Entitlement management
- `audit` - Audit log access
- `support` - Support operations

**Available Actions:**
- `create`, `read`, `update`, `delete` - Standard CRUD
- `manage` - Full control over resource
- `manage_roles` - Role assignment (users)
- `impersonate` - User impersonation (support)
- `access` - Access to support tools

**Wildcard Support:**
- `tenants:*` - All tenant management permissions
- `*:read` - Read permission on all resources
- `*:manage` - Manage permission on all resources
- `*:*` - All permissions (system_admin only)

### Platform RBAC Implementation

#### Decorators

```typescript
import {
  RequireAllPlatformPermissions,
  RequireAnyPlatformPermission,
} from 'src/common/decorators/platform-permissions.decorator';
import { PlatformPermissionsGuard } from 'src/common/guards/platform-permissions.guard';
```

#### Usage Examples

```typescript
// Require ANY platform permission (OR logic)
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('tenants:read')
@Get()
async listTenants(@CurrentUserIdentity() identity: AuthenticatedIdentityUser) {
  // User needs tenants:read permission
  // Uses IDENTITY token (not tenant token)
}

// Require ALL platform permissions (AND logic)
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAllPlatformPermissions('tenants:read', 'users:read')
@Get('tenant-users/:tenantId')
async getTenantUsers(@CurrentUserIdentity() identity: AuthenticatedIdentityUser) {
  // User needs BOTH tenants:read AND users:read
}

// Wildcard permission
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('templates:*')
@Post('templates')
async createGlobalTemplate(@CurrentUserIdentity() identity: AuthenticatedIdentityUser) {
  // User needs any template management permission
}

// Multiple permissions (OR logic)
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('templates:manage', 'templates:read')
@Get('templates/:key')
async getTemplate(@CurrentUserIdentity() identity: AuthenticatedIdentityUser) {
  // User needs either templates:manage OR templates:read
}
```

### Platform Permission Check Flow

```
Request → JWT Guard (Identity Token)
  → Extract platform role from token
  → PlatformPermissionsGuard
  → PlatformRbacService.getRolePermissions()
  → System role: In-memory lookup (O(1))
  → Custom role (future): Database query
  → Permission matcher (wildcard support)
  → Allow/Deny
```

### Key Files (Platform RBAC)

- `src/common/constants/platform-permissions.constant.ts` - Permission definitions (source of truth)
- `src/common/constants/platform-system-roles.constant.ts` - System role permissions (in-memory)
- `src/common/decorators/platform-permissions.decorator.ts` - Permission decorators
- `src/common/guards/platform-permissions.guard.ts` - Permission guard
- `src/common/utils/permission-matcher.util.ts` - Wildcard matching (shared)
- `src/modules/platform-rbac/platform-rbac.service.ts` - RBAC business logic
- `src/modules/platform-rbac/platform-rbac-sync.service.ts` - Database sync (on startup)
- `src/repositories/platform-rbac/` - RBAC repositories

---

## Permission Format

Both Tenant and Platform RBAC use the same permission format: `{resource}:{action}`

### Format Rules

1. **Resource**: Lowercase, singular or plural noun (e.g., `documents`, `tenants`, `users`)
2. **Action**: Lowercase verb or operation (e.g., `create`, `read`, `manage`)
3. **Separator**: Colon (`:`) between resource and action
4. **Wildcards**: Use `*` for resource or action to match all

### Valid Permission Examples

```typescript
// Specific permissions
'documents:create'      // Create documents
'tenants:read'          // Read tenant information
'users:manage_roles'    // Manage user roles
'templates:manage'      // Full template management

// Wildcard permissions
'documents:*'           // All document operations
'*:read'                // Read all resources
'*:*'                   // All permissions (admin only)
```

### Invalid Permission Examples

```typescript
// ❌ Wrong format
'documents'             // Missing action
'create:documents'      // Reversed order
'documents-create'      // Wrong separator
'Documents:Create'      // Wrong case
```

---

## Wildcard Permissions

Both RBAC systems support wildcard permissions for flexible access control.

### Wildcard Rules

1. **Resource Wildcard** (`*:action`): Grants action on all resources
2. **Action Wildcard** (`resource:*`): Grants all actions on resource
3. **Full Wildcard** (`*:*`): Grants all permissions (admin roles only)

### Wildcard Matching Logic

The permission matcher expands wildcards to determine access:

```typescript
// User permission expands to cover required permission
matchPermission('*:*', 'documents:read')        // ✅ true - covers everything
matchPermission('documents:*', 'documents:read') // ✅ true - covers all document actions
matchPermission('*:read', 'documents:read')      // ✅ true - covers read on all resources

// No match
matchPermission('documents:read', 'documents:create')  // ❌ false - different actions
matchPermission('documents:create', 'documents:*')     // ❌ false - user doesn't have wildcard
```

### Wildcard Best Practices

1. **Use wildcards for system roles** to simplify permission sets
2. **Avoid wildcards for custom roles** unless necessary
3. **Document wildcard usage** in role descriptions
4. **Test wildcard permissions** thoroughly

---

## Implementation Guide

### When to Use Tenant RBAC vs Platform RBAC

| Scenario | Use | Authentication | Example |
|----------|-----|----------------|---------|
| User creates a document | Tenant RBAC | Tenant Token | `@RequireAnyTenantPermission('documents:create')` |
| User manages team members | Tenant RBAC | Tenant Token | `@RequireAnyTenantPermission('team:manage')` |
| System admin creates tenant | Platform RBAC | Identity Token | `@RequireAnyPlatformPermission('tenants:create')` |
| System admin views all subscriptions | Platform RBAC | Identity Token | `@RequireAnyPlatformPermission('subscriptions:read')` |
| Support views tenant details | Platform RBAC | Identity Token | `@RequireAnyPlatformPermission('tenants:read')` |
| System admin manages global templates | Platform RBAC | Identity Token | `@RequireAnyPlatformPermission('templates:manage')` |

### Decision Tree

```
Is this a platform-wide operation?
├─ YES → Use Platform RBAC
│        - Requires identity token
│        - Use @AuthOptions({ identity: true })
│        - Use PlatformPermissionsGuard
│        - Use @RequireAnyPlatformPermission()
│
└─ NO → Is it tenant-specific?
         └─ YES → Use Tenant RBAC
                  - Requires tenant token
                  - Use @AuthOptions({ tenant: true })
                  - Use TenantPermissionsGuard
                  - Use @RequireAnyTenantPermission()
```

### Adding New Permissions

#### Tenant Permissions

1. **Add to TENANT_PERMISSIONS object** (single source of truth):
   ```typescript
   // src/common/constants/tenant-permissions.constant.ts
   export const TENANT_PERMISSIONS = {
     // ... existing categories
     NEW_RESOURCE: {
       NEW_ACTION: 'new_resource:new_action' as const,
       ALL: 'new_resource:*' as const,
     },
   };
   ```

2. **Restart app** - sync service automatically updates database
   - `ALL_TENANT_PERMISSIONS` array is automatically derived from the object
   - No need to manually maintain the array

#### Platform Permissions

1. **Add to PLATFORM_PERMISSIONS object** (single source of truth):
   ```typescript
   // src/common/constants/platform-permissions.constant.ts
   export const PLATFORM_PERMISSIONS = {
     // ... existing categories
     NEW_RESOURCE: {
       NEW_ACTION: 'new_resource:new_action' as const,
       ALL: 'new_resource:*' as const,
     },
   };
   ```

2. **Restart app** - sync service automatically updates database
   - `ALL_PLATFORM_PERMISSIONS` array is automatically derived from the object
   - No need to manually maintain the array

### Adding Permissions to System Roles

#### Tenant System Roles

```typescript
// src/common/constants/tenant-system-roles.constant.ts
export const TENANT_SYSTEM_ROLE_PERMISSIONS: Record<
  SystemTenantRole,
  ReadonlySet<TenantPermission>
> = {
  [SystemTenantRole.LEGAL_COUNSEL]: new Set([
    'documents:*',
    'contracts:*',
    'templates:*',
    'regulatory:query',
    'new_resource:new_action', // ← Add here
  ]),
};
```

#### Platform System Roles

```typescript
// src/common/constants/platform-system-roles.constant.ts
export const PLATFORM_SYSTEM_ROLE_PERMISSIONS: Record<
  SystemPlatformRole,
  ReadonlySet<PlatformPermission>
> = {
  [SystemPlatformRole.SUPPORT]: new Set([
    'tenants:read',
    'users:read',
    'new_resource:read', // ← Add here
  ]),
};
```

---

## Database Schema

### Tenant RBAC Tables

#### `tenant_roles` (Tenant Roles)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `key` | VARCHAR(50) | Role key (e.g., `tenant_admin`, `legal_counsel`) |
| `name` | VARCHAR(100) | Display name (e.g., `Tenant Admin`) |
| `description` | TEXT | Role description |
| `tenant_id` | UUID | NULL for system roles, UUID for custom tenant roles |
| `is_system` | BOOLEAN | TRUE for system roles, FALSE for custom roles |
| `is_active` | BOOLEAN | Active status |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

#### `tenant_permissions` (Tenant Permissions)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `key` | VARCHAR(100) | Permission key (e.g., `documents:create`) |
| `name` | VARCHAR(100) | Display name (e.g., `Create Documents`) |
| `resource` | VARCHAR(50) | Resource type (e.g., `documents`) |
| `action` | VARCHAR(50) | Action type (e.g., `create`) |
| `description` | TEXT | Permission description |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `tenant_role_permissions` (Many-to-Many)

| Column | Type | Description |
|--------|------|-------------|
| `role_id` | UUID | Foreign key to tenant_roles |
| `permission_id` | UUID | Foreign key to tenant_permissions |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### Platform RBAC Tables

#### `platform_roles`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `key` | VARCHAR(50) | Role key (e.g., `system_admin`, `support`) |
| `name` | VARCHAR(100) | Display name (e.g., `System Admin`) |
| `description` | TEXT | Role description |
| `is_system` | BOOLEAN | TRUE for system roles, FALSE for custom roles |
| `is_active` | BOOLEAN | Active status |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

#### `platform_permissions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `key` | VARCHAR(100) | Permission key (e.g., `tenants:create`) |
| `name` | VARCHAR(100) | Display name (e.g., `Create Tenants`) |
| `resource` | VARCHAR(50) | Resource type (e.g., `tenants`) |
| `action` | VARCHAR(50) | Action type (e.g., `create`) |
| `description` | TEXT | Permission description |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `platform_role_permissions` (Many-to-Many)

| Column | Type | Description |
|--------|------|-------------|
| `role_id` | UUID | Foreign key to platform_roles |
| `permission_id` | UUID | Foreign key to platform_permissions |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

## Automatic Synchronization

Both RBAC systems automatically sync permissions and system roles from code to database on every application startup.

### Tenant RBAC Sync

**Service:** `TenantRbacSyncService`  
**Trigger:** `OnModuleInit` lifecycle hook

**Source of Truth:**
- `TENANT_PERMISSIONS` object in `tenant-permissions.constant.ts` (single source)
- `ALL_TENANT_PERMISSIONS` array (automatically derived from object)
- `TENANT_SYSTEM_ROLE_PERMISSIONS` map in `tenant-system-roles.constant.ts`

**Sync Behavior:**
- **Permissions:** Add new, update existing, delete removed
- **System Roles:** Add new, update existing, sync role-permission mappings
- **Custom Roles:** Never touched (tenant_id IS NOT NULL)
- **Idempotent:** Safe to run on every startup

### Platform RBAC Sync

**Service:** `PlatformRbacSyncService`  
**Trigger:** `OnModuleInit` lifecycle hook

**Source of Truth:**
- `PLATFORM_PERMISSIONS` object in `platform-permissions.constant.ts` (single source)
- `ALL_PLATFORM_PERMISSIONS` array (automatically derived from object)
- `PLATFORM_SYSTEM_ROLE_PERMISSIONS` map in `platform-system-roles.constant.ts`

**Sync Behavior:**
- **Permissions:** Add new, update existing, delete removed
- **System Roles:** Add new, update existing, sync role-permission mappings
- **Custom Roles:** Never touched (is_system = false)
- **Idempotent:** Safe to run on every startup

### Sync Process

```
Application Startup
  ↓
TenantRbacSyncService.onModuleInit()
  ↓
1. Sync Tenant Permissions
   - Use ALL_TENANT_PERMISSIONS array (derived from TENANT_PERMISSIONS object)
   - Upsert to tenant_permissions table
   - Delete removed permissions
  ↓
2. Sync Tenant System Roles
   - Upsert system roles to tenant_roles table
   - Sync role-permission mappings
  ↓
PlatformRbacSyncService.onModuleInit()
  ↓
3. Sync Platform Permissions
   - Use ALL_PLATFORM_PERMISSIONS array (derived from PLATFORM_PERMISSIONS object)
   - Upsert to platform_permissions table
   - Delete removed permissions
  ↓
4. Sync Platform System Roles
   - Upsert system roles to platform_roles table
   - Sync role-permission mappings
  ↓
Application Ready
```

---

## Best Practices

### Permission Design

1. **Use specific permissions** over broad wildcards for custom roles
2. **Follow naming conventions** consistently (`{resource}:{action}`)
3. **Document new permissions** in code comments
4. **Group related permissions** by resource
5. **Use wildcards sparingly** (system roles only)

### Role Design

1. **System roles for common patterns** (tenant_admin, legal_counsel, etc.)
2. **Custom roles for tenant-specific needs** (future feature)
3. **Descriptive role names** that clearly indicate purpose
4. **Minimal permission sets** (principle of least privilege)

### Guard Usage

1. **Always specify authentication** with `@AuthOptions()`
2. **Use appropriate guard** for the scope (Tenant vs Platform)
3. **Prefer permission-based guards** over role checks for flexibility
4. **Use `RequireAny`** for OR logic, `RequireAll` for AND logic
5. **Document permission requirements** in API documentation

### Performance

1. **System roles use in-memory lookups** (O(1) performance)
2. **Custom roles query database** (acceptable for infrequent operations)
3. **Cache permission checks** if needed (future optimization)
4. **Minimize guard stacking** (use one RBAC guard per endpoint)

### Security

1. **Never bypass RBAC guards** without explicit reason
2. **Validate permissions at API boundary** (controllers)
3. **Log permission denials** for audit trail
4. **Review wildcard permissions** regularly
5. **Test permission boundaries** thoroughly

---

## Examples

### Complete Endpoint Examples

#### Tenant RBAC Example

```typescript
// Document creation endpoint (tenant-scoped)
@Controller('documents')
@ApiTags('documents')
export class DocumentsController {
  @Post()
  @AuthOptions({ tenant: true }) // Requires tenant token
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:create')
  @ApiOperation({ summary: 'Create document' })
  async createDocument(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: CreateDocumentDto,
  ) {
    // user.tenantId is available from tenant token
    // user.role contains tenant role (e.g., 'member')
    return this.documentsService.create(user.tenantId, dto);
  }

  @Delete(':id')
  @AuthOptions({ tenant: true })
  @UseGuards(TenantPermissionsGuard)
  @RequireAllTenantPermissions('documents:read', 'documents:delete')
  @ApiOperation({ summary: 'Delete document' })
  async deleteDocument(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('id') id: string,
  ) {
    // Requires BOTH read and delete permissions
    return this.documentsService.delete(user.tenantId, id);
  }
}
```

#### Platform RBAC Example

```typescript
// Tenant management endpoint (platform-scoped)
@Controller('admin/tenants')
@ApiTags('admin')
export class AdminController {
  @Get()
  @AuthOptions({ identity: true }) // Requires identity token
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('tenants:read')
  @ApiOperation({ summary: '[ADMIN] List all tenants' })
  async listTenants(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @Query() query: PaginationQueryDto,
  ) {
    // identity.platformRole contains platform role (e.g., 'system_admin')
    // identity.userId is available
    return this.tenantsService.findAll(query);
  }

  @Post()
  @AuthOptions({ identity: true })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('tenants:create')
  @ApiOperation({ summary: '[ADMIN] Create tenant' })
  async createTenant(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @Body() dto: CreateTenantDto,
  ) {
    // Only users with tenants:create permission can access
    return this.tenantsService.create(dto);
  }

  @Put(':tenantId')
  @AuthOptions({ identity: true })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('tenants:update')
  @ApiOperation({ summary: '[ADMIN] Update tenant' })
  async updateTenant(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(tenantId, dto);
  }
}
```

#### Mixed Authentication Example

```typescript
// Endpoint that requires both identity and tenant tokens
@Controller('admin/tenant-operations')
@ApiTags('admin')
export class AdminTenantOperationsController {
  @Get(':tenantId/documents')
  @AuthOptions({ identity: true, tenant: true }) // Requires BOTH tokens
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('tenants:read')
  @ApiOperation({ summary: '[ADMIN] View tenant documents' })
  async getTenantDocuments(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @CurrentUserTenant() tenant: AuthenticatedTenantUser,
    @Param('tenantId') tenantId: string,
  ) {
    // Has access to both identity and tenant context
    // Useful for admin operations on specific tenants
    return this.documentsService.findByTenant(tenantId);
  }
}
```

### Permission Matching Examples

```typescript
// Wildcard matching examples
const userPermissions = ['documents:*']; // User has all document permissions
const requiredPermission = 'documents:create';

// matchPermission expands wildcards
matchPermission('documents:*', 'documents:create')  // ✅ true
matchPermission('documents:*', 'documents:read')    // ✅ true
matchPermission('documents:*', 'documents:delete')  // ✅ true
matchPermission('documents:*', 'templates:create')  // ❌ false

// Full wildcard
matchPermission('*:*', 'documents:create')  // ✅ true
matchPermission('*:*', 'tenants:delete')    // ✅ true
matchPermission('*:*', 'anything:anything') // ✅ true

// Action wildcard
matchPermission('*:read', 'documents:read')  // ✅ true
matchPermission('*:read', 'tenants:read')    // ✅ true
matchPermission('*:read', 'documents:create') // ❌ false
```

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and authentication flow
- **[DATABASE.md](DATABASE.md)** - Complete database schema including RBAC tables
- **[API_CONTRACTS.md](../apps/api/docs/API_CONTRACTS.md)** - API authentication and authorization patterns
- **[CLAUDE.md](../CLAUDE.md)** - RBAC usage conventions (guards, decorators, adding permissions)

---

## Troubleshooting

### Common Issues

**Issue:** Permission denied even though user has the role
- **Solution:** Check if permission is synced to database (restart app)
- **Solution:** Verify wildcard matching logic
- **Solution:** Check if using correct guard (Tenant vs Platform)

**Issue:** Guard not working
- **Solution:** Ensure `@AuthOptions()` decorator is present
- **Solution:** Verify guard is imported and used correctly
- **Solution:** Check if RBAC module is imported in AppModule

**Issue:** Custom permissions not working
- **Solution:** Add permission to `ALL_*_PERMISSIONS` array
- **Solution:** Restart application to trigger sync
- **Solution:** Verify permission format (`resource:action`)

**Issue:** Wildcard not matching
- **Solution:** Check permission matcher implementation
- **Solution:** Verify wildcard is in user's role permissions
- **Solution:** Test with explicit permissions first

---

**Last Updated:** February 18, 2026  
**Maintained By:** Complytude Backend Team  
**Version:** 1.0

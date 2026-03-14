import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  RequireAllTenantPermissions,
  RequireAnyTenantPermission,
} from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';

/**
 * RBAC Mock Controller - Comprehensive Use Case Demonstrations
 *
 * This controller demonstrates all permission check patterns with the new wildcard approach.
 * Wildcards are now stored as real permissions in the database.
 *
 * System Roles:
 * - tenant_admin: Has '*:*' (full wildcard)
 * - legal_counsel: Has 'documents:*', 'contracts:*', 'templates:*', 'regulatory:query'
 * - member: Has 'documents:create', 'documents:read', 'templates:use', 'regulatory:query'
 * - viewer: Has 'documents:read', 'regulatory:query'
 */
@Controller('mock/rbac')
@AuthOptions({ tenant: true })
export class RbacMockController {
  // ============================================
  // USE CASE 1: Single Concrete Permission (Most Common)
  // ============================================
  // Requires: User must have 'documents:read'
  // Passes: tenant_admin (has *:*), legal_counsel (has documents:*), member (has documents:read), viewer (has documents:read)
  // How it works: matchTenantPermission checks if user's permissions match 'documents:read'
  //   - tenant_admin: '*:*' matches 'documents:read' ✓
  //   - legal_counsel: 'documents:*' matches 'documents:read' ✓
  //   - member: 'documents:read' matches 'documents:read' ✓
  //   - viewer: 'documents:read' matches 'documents:read' ✓
  @Get('documents')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:read')
  listDocuments(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return { message: `Documents listed by ${user.email} (${user.role})` };
  }

  // ============================================
  // USE CASE 2: Resource Wildcard Requirement
  // ============================================
  // Requires: User must have 'documents:*' (the wildcard itself as a permission)
  // Passes: tenant_admin (has *:*), legal_counsel (has documents:*)
  // Fails: member (only has documents:read, documents:create - not the wildcard), viewer
  // How it works: Checks if user has the wildcard permission 'documents:*'
  //   - tenant_admin: '*:*' matches 'documents:*' ✓
  //   - legal_counsel: 'documents:*' matches 'documents:*' ✓
  //   - member: 'documents:read' does NOT match 'documents:*' ✗
  @Get('documents/wildcard-required')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:*')
  requireDocumentsWildcard(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Wildcard permission verified for ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 3: Multiple Concrete Permissions (OR Logic)
  // ============================================
  // Requires: User must have 'documents:read' OR 'templates:use' OR 'regulatory:query'
  // Passes: All roles (all have at least one of these)
  // How it works: RequireAnyTenantPermission checks if user has ANY of the listed permissions
  @Get('multi-or')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission(
    'documents:read',
    'templates:use',
    'regulatory:query',
  )
  multiPermissionOr(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return { message: `Multi-OR accessed by ${user.email} (${user.role})` };
  }

  // ============================================
  // USE CASE 4: Multiple Concrete Permissions (AND Logic)
  // ============================================
  // Requires: User must have 'documents:read' AND 'documents:delete'
  // Passes: tenant_admin (has *:*), legal_counsel (has documents:*)
  // Fails: member (only has documents:read), viewer (only has documents:read)
  // How it works: RequireAllTenantPermissions checks if user has ALL listed permissions
  @Delete('documents/:id')
  @UseGuards(TenantPermissionsGuard)
  @RequireAllTenantPermissions('documents:read', 'documents:delete')
  deleteDocument(
    @Param('id') id: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    return {
      message: `Document ${id} deleted by ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 5: Full Wildcard (Admin Only)
  // ============================================
  // Requires: User must have '*:*' (full wildcard)
  // Passes: tenant_admin only
  // Fails: All other roles
  // How it works: Only tenant_admin has the '*:*' permission
  @Post('admin-only')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('*:*')
  adminOnlyAction(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return { message: `Admin action by ${user.email} (${user.role})` };
  }

  // ============================================
  // USE CASE 6: Cross-Resource Action Wildcard Requirement
  // ============================================
  // Requires: User must have '*:read' (the wildcard itself as a permission)
  // Passes: tenant_admin (has *:*), anyone who has the '*:read' wildcard permission
  // Fails: viewer (has documents:read, NOT the wildcard *:read), member
  // How it works: Checks if user has the '*:read' wildcard permission
  //   - tenant_admin: '*:*' covers '*:read' ✓
  //   - viewer: 'documents:read' does NOT match '*:read' ✗
  @Get('read-anything')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('*:read')
  readAnything(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Read-anything accessed by ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 7: Mixed Wildcards and Concrete (OR Logic)
  // ============================================
  // Requires: User must have 'documents:*' OR 'templates:use'
  // Passes: tenant_admin (has *:*), legal_counsel (has documents:*), member (has templates:use)
  // Fails: viewer (only has documents:read, not the wildcard or templates:use)
  // How it works: Checks if user has either the wildcard or the concrete permission
  @Post('mixed-permissions')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:*', 'templates:use')
  mixedPermissions(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Mixed permissions accessed by ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 8: Multiple Resource Wildcards (OR Logic)
  // ============================================
  // Requires: User must have 'documents:*' OR 'contracts:*' OR 'templates:*'
  // Passes: tenant_admin (has *:*), legal_counsel (has all three wildcards)
  // Fails: member, viewer (only have concrete permissions)
  // How it works: Checks if user has any of the wildcard permissions
  @Get('multi-wildcard-or')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:*', 'contracts:*', 'templates:*')
  multiWildcardOr(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Multi-wildcard-OR accessed by ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 9: Multiple Resource Wildcards (AND Logic)
  // ============================================
  // Requires: User must have 'documents:*' AND 'contracts:*' AND 'templates:*'
  // Passes: tenant_admin (has *:*), legal_counsel (has all three wildcards)
  // Fails: member, viewer (don't have wildcards)
  // How it works: Checks if user has ALL wildcard permissions
  @Post('multi-wildcard-and')
  @UseGuards(TenantPermissionsGuard)
  @RequireAllTenantPermissions('documents:*', 'contracts:*', 'templates:*')
  multiWildcardAnd(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Multi-wildcard-AND accessed by ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 10: Concrete Permission with Wildcard User
  // ============================================
  // Requires: User must have 'contracts:analyze'
  // Passes: tenant_admin (has *:*), legal_counsel (has contracts:*)
  // Fails: member, viewer (don't have contracts permissions)
  // How it works: User's wildcard 'contracts:*' matches required 'contracts:analyze'
  @Post('contracts/analyze')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('contracts:analyze')
  analyzeContract(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return { message: `Contract analyzed by ${user.email} (${user.role})` };
  }

  // ============================================
  // USE CASE 11: Complex AND Logic with Wildcards
  // ============================================
  // Requires: User must have 'contracts:analyze' AND 'documents:create'
  // Passes: tenant_admin (has *:*), legal_counsel (has contracts:* and documents:*)
  // Fails: member (only has documents:create, not contracts:analyze), viewer
  // How it works: Checks if user has BOTH permissions (wildcards match concrete)
  @Post('contracts/redline')
  @UseGuards(TenantPermissionsGuard)
  @RequireAllTenantPermissions('contracts:analyze', 'documents:create')
  redlineContract(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return { message: `Contract redlined by ${user.email} (${user.role})` };
  }

  // ============================================
  // USE CASE 12: Cross-Resource Manage Wildcard
  // ============================================
  // Requires: User must have '*:manage' (manage on any resource)
  // Passes: tenant_admin (has *:*), anyone with settings:manage, billing:manage, team:manage, templates:manage
  // How it works: matchTenantPermission checks if user has any permission ending with ':manage'
  @Patch('manage-anything')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('*:manage')
  manageAnything(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Manage-anything accessed by ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 13: No Permission Required (Authenticated Only)
  // ============================================
  // Requires: Only tenant authentication (no specific permission)
  // Passes: All authenticated users with tenant token
  // How it works: No PermissionsGuard, only AuthOptions({ tenant: true })
  @Get('public')
  publicEndpoint(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Public endpoint accessed by ${user.email} (${user.role})`,
    };
  }

  // ============================================
  // USE CASE 14: Specific Action on Specific Resource
  // ============================================
  // Requires: User must have 'settings:change_jurisdiction'
  // Passes: tenant_admin (has *:*), no one else (critical permission)
  // Fails: legal_counsel, member, viewer (don't have settings permissions)
  // How it works: Checks for very specific permission
  @Patch('settings/jurisdiction')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:change_jurisdiction')
  changeJurisdiction(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return {
      message: `Jurisdiction changed by ${user.email} (${user.role}) - CRITICAL`,
    };
  }

  // ============================================
  // USE CASE 15: Billing and Settings (OR Logic)
  // ============================================
  // Requires: User must have 'billing:manage' OR 'settings:manage'
  // Passes: tenant_admin (has *:*)
  // Fails: legal_counsel, member, viewer (don't have billing or settings)
  // How it works: Checks if user has either billing or settings management
  @Get('billing')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('billing:manage', 'settings:manage')
  manageBilling(@CurrentUserTenant() user: AuthenticatedTenantUser) {
    return { message: `Billing accessed by ${user.email} (${user.role})` };
  }
}

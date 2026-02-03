import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  AuditResource,
} from 'src/common/decorators/audit.decorator';
import {
  RequireAllPermissions,
  RequireAnyPermission,
} from 'src/common/decorators/permissions.decorator';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import {
  ApiAuthenticatedResponses,
  ApiForbiddenError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';

/**
 * RBAC Mock Controller
 *
 * This controller demonstrates different permission requirements for testing RBAC.
 * Each endpoint requires different permissions to test the permission system.
 * All requests are automatically logged by the AuditInterceptor.
 */
@ApiTags('Mock - RBAC Testing')
@Controller('mock/rbac')
@AuditResource('rbac_test')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class RbacMockController {
  // =========================
  // Documents Permissions
  // =========================

  @Get('documents')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('documents:read')
  @AuditAction({ action: 'read', resourceType: 'documents' })
  @ApiOperation({
    summary: 'Mock: List documents',
    description:
      'Requires documents:read permission. Available to: tenant_admin, legal_counsel, member, viewer',
  })
  @ApiResponse({
    status: 200,
    description: 'Documents listed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires documents:read permission')
  @ApiAuthenticatedResponses()
  listDocuments(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Documents list accessed by ${user.email} (role: ${user.role})`,
    };
  }

  @Post('documents')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('documents:create')
  @AuditAction({ action: 'create', resourceType: 'documents' })
  @ApiOperation({
    summary: 'Mock: Create document',
    description:
      'Requires documents:create permission. Available to: tenant_admin, legal_counsel, member',
  })
  @ApiResponse({
    status: 201,
    description: 'Document created successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires documents:create permission')
  @ApiAuthenticatedResponses()
  createDocument(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Document created by ${user.email} (role: ${user.role})`,
    };
  }

  @Delete('documents/:id')
  @UseGuards(PermissionsGuard)
  @RequireAllPermissions('documents:read', 'documents:delete')
  @AuditAction({ action: 'delete', resourceType: 'documents' })
  @ApiOperation({
    summary: 'Mock: Delete document (AND logic)',
    description:
      'Requires BOTH documents:read AND documents:delete permissions. User must have both to delete. Available to: tenant_admin, legal_counsel',
  })
  @ApiResponse({
    status: 200,
    description: 'Document deleted successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires ALL of: documents:read, documents:delete')
  @ApiAuthenticatedResponses()
  deleteDocument(
    @Param('id') id: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Document ${id} deleted by ${user.email} (role: ${user.role})`,
    };
  }

  // =========================
  // Contracts Permissions
  // =========================

  @Post('contracts/analyze')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('contracts:analyze', 'documents:read')
  @AuditAction({ action: 'analyze', resourceType: 'contracts' })
  @ApiOperation({
    summary: 'Mock: Analyze contract (OR logic)',
    description:
      'Requires contracts:analyze OR documents:read permission. User needs at least ONE of these.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract analyzed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires ANY of: contracts:analyze, documents:read')
  @ApiAuthenticatedResponses()
  analyzeContract(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Contract analysis initiated by ${user.email} (role: ${user.role})`,
    };
  }

  @Post('contracts/redline')
  @UseGuards(PermissionsGuard)
  @RequireAllPermissions('contracts:analyze', 'documents:create')
  @AuditAction({ action: 'redline', resourceType: 'contracts' })
  @ApiOperation({
    summary: 'Mock: Redline contract (AND logic)',
    description:
      'Requires BOTH contracts:analyze AND documents:create permissions. User must have both to redline contracts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract redlined successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires ALL of: contracts:analyze, documents:create')
  @ApiAuthenticatedResponses()
  redlineContract(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Contract redlining initiated by ${user.email} (role: ${user.role})`,
    };
  }

  // =========================
  // Templates Permissions
  // =========================

  @Get('templates')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('templates:use')
  @AuditAction({ action: 'use', resourceType: 'templates' })
  @ApiOperation({
    summary: 'Mock: Use template',
    description:
      'Requires templates:use permission. Available to: tenant_admin, legal_counsel, member',
  })
  @ApiResponse({
    status: 200,
    description: 'Template accessed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires templates:use permission')
  @ApiAuthenticatedResponses()
  useTemplate(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Template used by ${user.email} (role: ${user.role})`,
    };
  }

  @Post('templates')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('templates:manage', 'documents:create')
  @AuditAction({ action: 'manage', resourceType: 'templates' })
  @ApiOperation({
    summary: 'Mock: Manage template (OR logic)',
    description:
      'Requires templates:manage OR documents:create permission. User needs at least ONE of these.',
  })
  @ApiResponse({
    status: 201,
    description: 'Template managed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires ANY of: templates:manage, documents:create')
  @ApiAuthenticatedResponses()
  manageTemplate(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Template management action by ${user.email} (role: ${user.role})`,
    };
  }

  // =========================
  // Regulatory Permissions
  // =========================

  @Get('regulatory')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('regulatory:query')
  @AuditAction({ action: 'query', resourceType: 'regulatory' })
  @ApiOperation({
    summary: 'Mock: Query regulatory hub',
    description:
      'Requires regulatory:query permission. Available to: all roles',
  })
  @ApiResponse({
    status: 200,
    description: 'Regulatory data queried successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires regulatory:query permission')
  @ApiAuthenticatedResponses()
  queryRegulatory(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Regulatory query by ${user.email} (role: ${user.role})`,
    };
  }

  // =========================
  // Billing Permissions
  // =========================

  @Get('billing')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('billing:manage', 'settings:manage')
  @AuditAction({ action: 'manage', resourceType: 'billing' })
  @ApiOperation({
    summary: 'Mock: Manage billing (OR logic)',
    description:
      'Requires billing:manage OR settings:manage permission. User needs at least ONE of these.',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing accessed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires ANY of: billing:manage, settings:manage')
  @ApiAuthenticatedResponses()
  manageBilling(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Billing accessed by ${user.email} (role: ${user.role})`,
    };
  }

  // =========================
  // Team Permissions
  // =========================

  @Get('team')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('team:manage', 'settings:manage', 'billing:manage')
  @AuditAction({ action: 'manage', resourceType: 'team' })
  @ApiOperation({
    summary: 'Mock: Manage team (OR logic)',
    description:
      'Requires team:manage OR settings:manage OR billing:manage permission. User needs at least ONE of these.',
  })
  @ApiResponse({
    status: 200,
    description: 'Team accessed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError(
    'Requires ANY of: team:manage, settings:manage, billing:manage',
  )
  @ApiAuthenticatedResponses()
  manageTeam(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Team management accessed by ${user.email} (role: ${user.role})`,
    };
  }

  // =========================
  // Settings Permissions
  // =========================

  @Get('settings')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
  @AuditAction({ action: 'manage', resourceType: 'settings' })
  @ApiOperation({
    summary: 'Mock: Manage settings',
    description:
      'Requires settings:manage permission. Available to: tenant_admin only',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings accessed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError('Requires settings:manage permission')
  @ApiAuthenticatedResponses()
  manageSettings(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Settings accessed by ${user.email} (role: ${user.role})`,
    };
  }

  @Patch('settings/jurisdiction')
  @UseGuards(PermissionsGuard)
  @RequireAllPermissions('settings:change_jurisdiction', 'settings:manage')
  @AuditAction({
    action: 'change',
    subResource: 'jurisdiction',
    resourceType: 'settings',
  })
  @ApiOperation({
    summary: 'Mock: Change jurisdiction (AND logic - CRITICAL)',
    description:
      'Requires BOTH settings:change_jurisdiction AND settings:manage permissions. User must have both for this CRITICAL action that affects legal logic.',
  })
  @ApiResponse({
    status: 200,
    description: 'Jurisdiction changed successfully',
    type: MessageResponseDto,
  })
  @ApiForbiddenError(
    'Requires ALL of: settings:change_jurisdiction, settings:manage',
  )
  @ApiAuthenticatedResponses()
  changeJurisdiction(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Jurisdiction change initiated by ${user.email} (role: ${user.role}) - CRITICAL ACTION`,
    };
  }

  // =========================
  // Advanced Permission Testing
  // =========================

  @Get('multi-permission-any')
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('documents:read', 'templates:use', 'regulatory:query')
  @ApiOperation({
    summary: 'Mock: Multiple permissions (OR logic)',
    description:
      'Requires documents:read OR templates:use OR regulatory:query permission. User needs at least ONE of these.',
  })
  @ApiResponse({
    status: 200,
    description: 'Access granted with at least one permission',
    type: MessageResponseDto,
  })
  @ApiForbiddenError(
    'Requires ANY of: documents:read, templates:use, regulatory:query',
  )
  @ApiAuthenticatedResponses()
  multiPermissionAny(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Multi-permission (ANY) endpoint accessed by ${user.email} (role: ${user.role})`,
    };
  }

  @Post('multi-permission-all')
  @UseGuards(PermissionsGuard)
  @RequireAllPermissions('documents:read', 'documents:create', 'templates:use')
  @ApiOperation({
    summary: 'Mock: Multiple permissions (AND logic)',
    description:
      'Requires ALL of: documents:read AND documents:create AND templates:use. User must have all three permissions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Access granted with all required permissions',
    type: MessageResponseDto,
  })
  @ApiForbiddenError(
    'Requires ALL of: documents:read, documents:create, templates:use',
  )
  @ApiAuthenticatedResponses()
  multiPermissionAll(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Multi-permission (ALL) endpoint accessed by ${user.email} (role: ${user.role})`,
    };
  }

  // =========================
  // Public Endpoint (No Permission)
  // =========================

  @Get('public')
  @ApiOperation({
    summary: 'Mock: Public endpoint',
    description: 'No permission required. Only requires tenant authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Public endpoint accessed',
    type: MessageResponseDto,
  })
  @ApiAuthenticatedResponses()
  publicEndpoint(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): MessageResponseDto {
    return {
      message: `Public endpoint accessed by ${user.email} (role: ${user.role})`,
    };
  }
}

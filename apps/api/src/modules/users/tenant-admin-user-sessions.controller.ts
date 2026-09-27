import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TENANT_PERMISSIONS } from 'src/common/constants/tenant-permissions.constant';
import { Audit } from 'src/common/decorators/audit.decorator';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import { SessionIdParamDto } from '../auth/dto/session-id-param.dto';
import { SessionListResponseDto } from '../auth/dto/session-list-response.dto';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { UsersService } from './users.service';

/**
 * Tenant admin endpoints for managing user sessions inside current tenant scope.
 */
@ApiTags('Tenant Admin - User Sessions')
@Controller('tenants/admin/users')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
@UseGuards(TenantPermissionsGuard)
export class TenantAdminUserSessionsController {
  private readonly logger = new Logger(TenantAdminUserSessionsController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /tenants/admin/users/:userId/sessions
   * View target user's sessions in current tenant.
   */
  @Get(':userId/sessions')
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.SESSIONS.MANAGE)
  @ApiOperation({
    summary: 'View user sessions in tenant',
    description:
      'List the target user identity sessions and linked tenant sessions scoped to the current tenant.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Target user UUID',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'User tenant sessions retrieved successfully',
    type: SessionListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - sessions:manage permission required',
  })
  @ApiResponse({
    status: 404,
    description: 'Target user not found in tenant',
  })
  listUserSessions(
    @Param('userId') userId: string,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<SessionListResponseDto> {
    this.logger.log(
      `Tenant admin ${admin.userId} listing sessions for user ${userId} in tenant ${admin.tenantId}`,
    );
    return this.usersService.listTenantUserSessions(admin.tenantId, userId);
  }

  /**
   * DELETE /tenants/admin/users/:userId/sessions
   * Force logout all target user sessions in current tenant.
   */
  @Delete(':userId/sessions')
  @HttpCode(HttpStatus.OK)
  @Audit('TENANT_ADMIN_USER_SESSIONS_INVALIDATED', {
    resourceType: 'sessions',
    resourceIdParam: 'userId',
  })
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.SESSIONS.MANAGE)
  @ApiOperation({
    summary: 'Force logout user from tenant',
    description:
      'Invalidate all tenant sessions for the target user in the current tenant across all devices.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Target user UUID',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Target user sessions invalidated successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - sessions:manage permission required',
  })
  @ApiResponse({
    status: 404,
    description: 'Target user not found in tenant',
  })
  async forceLogoutUserFromTenant(
    @Param('userId') userId: string,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    this.logger.warn(
      `Tenant admin ${admin.userId} invalidating all sessions for user ${userId} in tenant ${admin.tenantId}`,
    );
    await this.usersService.forceLogoutUserFromTenantSessions(
      admin.tenantId,
      userId,
    );
    return { message: 'User sessions invalidated successfully' };
  }

  /**
   * DELETE /tenants/admin/users/:userId/sessions/:sessionId
   * Force logout specific tenant session for target user.
   */
  @Delete(':userId/sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @Audit('TENANT_ADMIN_USER_SESSION_INVALIDATED', {
    resourceType: 'sessions',
    resourceIdParam: 'sessionId',
  })
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.SESSIONS.MANAGE)
  @ApiOperation({
    summary: 'Force logout specific user session',
    description:
      'Invalidate a specific tenant session for the target user within current tenant.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Target user UUID',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Target tenant session UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Target session invalidated successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - sessions:manage permission required',
  })
  @ApiResponse({
    status: 404,
    description: 'Target user not found in tenant or session not found',
  })
  async forceLogoutSpecificUserSession(
    @Param('userId') userId: string,
    @Param() params: SessionIdParamDto,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    this.logger.warn(
      `Tenant admin ${admin.userId} invalidating session ${params.sessionId} for user ${userId} in tenant ${admin.tenantId}`,
    );
    await this.usersService.forceLogoutSpecificTenantSession(
      admin.tenantId,
      userId,
      params.sessionId,
    );
    return { message: 'Session invalidated successfully' };
  }
}

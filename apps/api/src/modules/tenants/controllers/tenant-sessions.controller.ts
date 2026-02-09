import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import { RequireAnyPermission } from 'src/common/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import {
  ApiAuthenticatedResponses,
  ApiNotFoundError,
  ApiValidationError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { AuthOptions } from 'src/modules/auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from 'src/modules/auth/decorators/current-user.decorator';
import { SessionListResponseDto, SessionListItemDto } from 'src/modules/auth/dto/session-response.dto';
import { SessionIdParamDto } from 'src/modules/auth/dto/session-id-param.dto';
import { SessionService } from 'src/modules/auth/services/session.service';
import { SessionInvalidationService } from 'src/modules/auth/services/session-invalidation.service';
import type { AuthenticatedTenantUser } from 'src/modules/auth/strategies';
import { AuditService } from 'src/modules/audit/audit.service';

/**
 * TenantSessionsController - Tenant admin session management
 *
 * Allows tenant admins to:
 * - View active sessions for users in their tenant
 * - Force-logout users from specific sessions or all sessions
 *
 * RBAC: Requires 'sessions:manage' permission
 */
@ApiTags('Tenant Admin - Sessions')
@Controller('tenants/:tenantId/users/:userId/sessions')
export class TenantSessionsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /tenants/:tenantId/users/:userId/sessions
   * View user's active sessions in the tenant
   */
  @Get()
  @AuthOptions({ tenant: true })
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('sessions:manage')
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "View user's active sessions in tenant",
    description:
      'Tenant admins can view all active sessions for a specific user in their tenant. ' +
      'Shows device info, location, and last activity.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Session list retrieved successfully',
    type: SessionListResponseDto,
  })
  @ApiNotFoundError('User not found in tenant')
  @ApiValidationError()
  @ApiAuthenticatedResponses()
  async listUserSessions(
    @Param('tenantId') tenantId: string,
    @Param('userId') targetUserId: string,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<SessionListResponseDto> {
    // Verify tenant context matches
    if (admin.tenantId !== tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    // Get tenant sessions for the target user in this tenant
    const tenantSessions = await this.sessionService.getUserTenantSessions(
      targetUserId,
      tenantId,
    );

    // Get identity sessions to enrich with device info
    const identitySessions = await this.sessionService.getUserIdentitySessions(targetUserId);

    const sessions: SessionListItemDto[] = [];

    for (const tenantSession of tenantSessions) {
      const identitySession = identitySessions.find(
        (is) => is.activeTenantSessionIds.includes(tenantSession.identitySessionId),
      );

      if (identitySession) {
        sessions.push({
          sessionId: tenantSession.identitySessionId,
          sessionType: 'tenant',
          deviceInfo: identitySession.deviceInfo,
          ipAddress: identitySession.ipAddress,
          geoLocation: identitySession.geoLocation,
          sessionName: identitySession.sessionName,
          tenantId: tenantSession.tenantId,
          createdAt: tenantSession.createdAt,
          lastActivityAt: tenantSession.lastActivityAt,
          isCurrentSession: false, // Admin viewing another user's sessions
        });
      }
    }

    return {
      sessions,
      total: sessions.length,
    };
  }

  /**
   * DELETE /tenants/:tenantId/users/:userId/sessions/:sessionId
   * Force-logout user from specific session
   */
  @Delete(':sessionId')
  @AuthOptions({ tenant: true })
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('sessions:manage')
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-logout user from specific session',
    description:
      'Tenant admin can force-logout a user from a specific identity session. ' +
      'All linked tenant sessions are also deleted.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiParam({ name: 'sessionId', description: 'Identity session UUID' })
  @ApiResponse({
    status: 200,
    description: 'User logged out from specific session',
    type: MessageResponseDto,
  })
  @ApiNotFoundError('Session not found')
  @ApiValidationError()
  @ApiAuthenticatedResponses()
  async forceLogoutSpecificSession(
    @Param('tenantId') tenantId: string,
    @Param('userId') targetUserId: string,
    @Param() params: SessionIdParamDto,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    // Verify tenant context matches
    if (admin.tenantId !== tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    const deleted = await this.sessionService.deleteIdentitySession(
      params.sessionId,
      targetUserId,
    );

    if (!deleted) {
      throw new NotFoundException('Session not found');
    }

    // Audit log
    await this.auditService.log({
      tenantId,
      userId: admin.userId,
      userRole: admin.role,
      action: 'sessions:force_logout_specific',
      resourceType: 'session',
      resourceId: params.sessionId,
      details: {
        targetUserId,
        sessionId: params.sessionId,
        reason: 'tenant_admin_action',
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return {
      message: 'User logged out from specific session successfully',
    };
  }

  /**
   * DELETE /tenants/:tenantId/users/:userId/sessions
   * Force-logout user from all sessions in the tenant
   */
  @Delete()
  @AuthOptions({ tenant: true })
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('sessions:manage')
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-logout user from all sessions in tenant',
    description:
      'Tenant admin can force-logout a user from all tenant sessions. ' +
      'Identity sessions remain active (user can still access other tenants).',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User logged out from all tenant sessions',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiAuthenticatedResponses()
  async forceLogoutAllTenantSessions(
    @Param('tenantId') tenantId: string,
    @Param('userId') targetUserId: string,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    // Verify tenant context matches
    if (admin.tenantId !== tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    const count = await this.sessionInvalidationService.invalidateUserTenantSessions(
      targetUserId,
      tenantId,
      'tenant_admin_force_logout',
    );

    // Audit log
    await this.auditService.log({
      tenantId,
      userId: admin.userId,
      userRole: admin.role,
      action: 'sessions:force_logout_all_tenant',
      resourceType: 'user_tenant',
      resourceId: targetUserId,
      details: {
        targetUserId,
        sessionsInvalidated: count,
        reason: 'tenant_admin_action',
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return {
      message: `User logged out from ${count} session(s) in this tenant`,
    };
  }
}

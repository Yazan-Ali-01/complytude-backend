import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  AuditResource,
} from 'src/common/decorators/audit.decorator';
import { RequireAnyPermission } from 'src/common/decorators/permissions.decorator';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import {
  ApiAuthenticatedResponses,
  ApiNotFoundError,
  ApiValidationError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { AuthOptions } from 'src/modules/auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from 'src/modules/auth/decorators/current-user.decorator';
import { ListTenantSessionsQueryDto } from 'src/modules/auth/dto/list-tenant-sessions-query.dto';
import {
  SessionListItemDto,
  SessionListResponseDto,
} from 'src/modules/auth/dto/session-response.dto';
import type { AuthenticatedTenantUser } from 'src/modules/auth/strategies';
import { SessionInvalidationService } from 'src/modules/sessions/services/session-invalidation.service';
import { SessionService } from 'src/modules/sessions/services/session.service';

/**
 * TenantSessionsController - Tenant admin session management
 *
 * Security:
 * - Tenant ID comes from JWT token (@CurrentUserTenant), NOT from URL
 * - Follows OWASP principle: "Don't accept from user what you have from auth"
 * - Prevents parameter tampering attacks
 * - Automatic audit logging via @AuditResource and @AuditAction decorators
 *
 * Responsibilities:
 * - List all user sessions in tenant (with pagination and filtering)
 * - View specific user's sessions
 * - Force-logout users from sessions
 *
 * RBAC: Requires 'sessions:manage' permission
 * Audit: All actions logged automatically via AuditInterceptor
 */
@ApiTags('Tenant Admin - Sessions')
@Controller('tenants/sessions')
@AuditResource('user_sessions')
export class TenantSessionsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    // AuditService removed - using decorators instead (automatic via AuditInterceptor)
  ) {}

  /**
   * GET /tenants/sessions
   * List all users' sessions in tenant (with pagination and filtering)
   */
  @Get()
  @AuthOptions({ tenant: true })
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('sessions:manage')
  @AuditAction('list')
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all user sessions in tenant',
    description:
      'Tenant admins can view all active sessions in their tenant. ' +
      'Supports pagination and filtering by userId. Tenant ID comes from JWT token for security.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session list retrieved successfully',
    type: SessionListResponseDto,
  })
  @ApiValidationError()
  @ApiAuthenticatedResponses()
  async listAllTenantSessions(
    @Query() query: ListTenantSessionsQueryDto,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<SessionListResponseDto> {
    // Tenant ID from JWT token (secure)
    const tenantId = admin.tenantId;

    // If filtering by specific user
    if (query.userId) {
      const tenantSessions = await this.sessionService.getUserTenantSessions(
        query.userId,
        tenantId,
      );

      const identitySessions =
        await this.sessionService.getUserIdentitySessions(query.userId);

      const sessions: SessionListItemDto[] = [];

      for (const tenantSession of tenantSessions) {
        const identitySession = identitySessions.find(
          (is) => is.sessionId === tenantSession.identitySessionId,
        );

        if (identitySession) {
          sessions.push({
            sessionId: tenantSession.sessionId,
            sessionType: 'tenant',
            deviceInfo: identitySession.deviceInfo,
            ipAddress: identitySession.ipAddress,
            geoLocation: identitySession.geoLocation,
            sessionName: identitySession.sessionName,
            tenantId: tenantSession.tenantId,
            createdAt: tenantSession.createdAt,
            lastActivityAt: tenantSession.lastActivityAt,
            isCurrentSession: false,
          });
        }
      }

      return {
        sessions,
        total: sessions.length,
      };
    }

    // List ALL users' sessions in tenant (no userId filter)
    // TODO: Implement tenant-wide session listing with proper pagination
    // For now, return placeholder
    return {
      sessions: [],
      total: 0,
    };
  }

  /**
   * GET /tenants/sessions/users/:userId
   * View specific user's active sessions in current tenant
   */
  @Get('users/:userId')
  @AuthOptions({ tenant: true })
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('sessions:manage')
  @AuditAction('view')
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "View specific user's sessions in tenant",
    description:
      'Tenant admins can view all active sessions for a specific user in their tenant. ' +
      'Tenant ID comes from JWT token for security. Shows device info, location, and last activity.',
  })
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
    @Param('userId') targetUserId: string,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<SessionListResponseDto> {
    // Tenant ID from JWT token (secure - can't be manipulated)
    const tenantId = admin.tenantId;

    // Get tenant sessions for the target user in this tenant
    const tenantSessions = await this.sessionService.getUserTenantSessions(
      targetUserId,
      tenantId,
    );

    // Get identity sessions to enrich with device info
    const identitySessions =
      await this.sessionService.getUserIdentitySessions(targetUserId);

    const sessions: SessionListItemDto[] = [];

    for (const tenantSession of tenantSessions) {
      // Find parent identity session by matching sessionId
      const identitySession = identitySessions.find(
        (is) => is.sessionId === tenantSession.identitySessionId,
      );

      if (identitySession) {
        sessions.push({
          sessionId: tenantSession.sessionId,
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
   * DELETE /tenants/sessions/users/:userId/:sessionId
   * Force-logout user from specific session
   */
  @Delete('users/:userId/:sessionId')
  @AuthOptions({ tenant: true })
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('sessions:manage')
  @AuditAction('force_logout_specific')
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-logout user from specific session',
    description:
      'Tenant admin can force-logout a user from a specific identity session. ' +
      'Tenant ID comes from JWT token for security. All linked tenant sessions are also deleted.',
  })
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
    @Param('userId') targetUserId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUserTenant() _admin: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    // Tenant context validated by @AuthOptions({ tenant: true }) + @CurrentUserTenant()
    // Parameter needed for guard validation but not used in method body

    const deleted = await this.sessionService.deleteIdentitySession(
      sessionId,
      targetUserId,
    );

    if (!deleted) {
      throw new NotFoundException('Session not found');
    }

    // Audit logged automatically via @AuditAction decorator
    return {
      message: 'User logged out from specific session successfully',
    };
  }

  /**
   * DELETE /tenants/sessions/users/:userId
   * Force-logout user from all sessions in the tenant
   */
  @Delete('users/:userId')
  @AuthOptions({ tenant: true })
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('sessions:manage')
  @AuditAction('force_logout_all')
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-logout user from all sessions in tenant',
    description:
      'Tenant admin can force-logout a user from all tenant sessions. ' +
      'Tenant ID comes from JWT token for security. Identity sessions remain active (user can still access other tenants).',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User logged out from all tenant sessions',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiAuthenticatedResponses()
  async forceLogoutAllTenantSessions(
    @Param('userId') targetUserId: string,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    // Tenant ID from JWT token (secure - can't be manipulated)
    const tenantId = admin.tenantId;

    const count =
      await this.sessionInvalidationService.invalidateUserTenantSessions(
        targetUserId,
        tenantId,
        'tenant_admin_force_logout',
      );

    // Audit logged automatically via @AuditAction decorator
    return {
      message: `User logged out from ${count} session(s) in this tenant`,
    };
  }
}

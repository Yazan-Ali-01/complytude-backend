import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import {
  ApiAuthenticatedResponses,
  ApiNotFoundError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { AuthOptions } from 'src/modules/auth/decorators/auth-options.decorator';
import { CurrentUserIdentity } from 'src/modules/auth/decorators/current-user.decorator';
import { SessionListResponseDto, SessionStatsDto, SessionListItemDto } from 'src/modules/auth/dto/session-response.dto';
import { SessionIdParamDto } from 'src/modules/auth/dto/session-id-param.dto';
import { SessionService } from 'src/modules/auth/services/session.service';
import { SessionInvalidationService } from 'src/modules/auth/services/session-invalidation.service';
import type { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import { AuditService } from 'src/modules/audit/audit.service';

/**
 * AdminSessionsController - System admin session management
 *
 * Allows system admins to:
 * - View global session statistics
 * - View sessions for any tenant (sanitized data)
 * - View sessions for any user (sanitized data, all tenants)
 * - Force-logout any user from any session
 *
 * Security:
 * - All actions are audited via AuditService (Break Glass logging)
 * - Sanitized data (no sensitive business info, only device/location/timestamps)
 *
 * Authentication: Requires identity token with SYSTEM_ADMIN role
 */
@ApiTags('System Admin - Sessions')
@Controller('admin')
@AuthOptions({ identity: true })
@UseGuards(SystemAdminGuard)
@SwaggerCookieAuth.identityAccessToken()
export class AdminSessionsController {
  private readonly logger = new Logger(AdminSessionsController.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /admin/sessions/stats
   * Get global session statistics
   */
  @Get('sessions/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Get global session statistics',
    description:
      'Returns aggregated statistics about active sessions across the platform. ' +
      'Includes total sessions, sessions by tenant, and active users.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session statistics retrieved successfully',
    type: SessionStatsDto,
  })
  @ApiAuthenticatedResponses()
  async getSessionStats(
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
  ): Promise<SessionStatsDto> {
    this.logger.log(`[ADMIN] User ${admin.userId} accessing session statistics`);

    const stats = await this.sessionInvalidationService.getSessionStats();

    // Audit log - Break Glass
    await this.auditService.log({
      tenantId: undefined,
      userId: admin.userId,
      userRole: 'system_admin',
      action: 'system_admin:session_stats_access',
      resourceType: 'sessions',
      resourceId: 'global',
      details: {
        type: 'BREAK_GLASS',
        operationType: 'view_stats',
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return {
      totalIdentitySessions: stats.totalIdentity,
      totalTenantSessions: stats.totalTenant,
      sessionsByTenant: stats.sessionsByTenant,
      sessionsByDeviceType: stats.sessionsByDeviceType,
      activeUsersLast24h: stats.activeUsersLast24h,
      activeUsersLast7d: stats.activeUsersLast7d,
    };
  }

  /**
   * GET /admin/users/:userId/sessions
   * View all sessions for a specific user (all tenants, sanitized)
   */
  @Get('users/:userId/sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] View user sessions (all tenants)',
    description:
      'Returns all active sessions for a specific user across all tenants. ' +
      'Data is sanitized (device info, location, timestamps only - no sensitive business data).',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User sessions retrieved successfully (sanitized)',
    type: SessionListResponseDto,
  })
  @ApiNotFoundError('User not found')
  @ApiAuthenticatedResponses()
  async getUserSessions(
    @Param('userId') targetUserId: string,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
  ): Promise<SessionListResponseDto> {
    this.logger.warn(
      `[ADMIN] User ${admin.userId} accessing sessions for user ${targetUserId}`,
    );

    const identitySessions = await this.sessionService.getUserIdentitySessions(targetUserId);

    if (!identitySessions || identitySessions.length === 0) {
      // User exists but has no active sessions
      return { sessions: [], total: 0 };
    }

    // Sanitized session data (no sensitive business info)
    const sessions: SessionListItemDto[] = identitySessions.map((session) => ({
      sessionId: session.userId,
      sessionType: 'identity',
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      geoLocation: session.geoLocation,
      sessionName: session.sessionName,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      isCurrentSession: false,
    }));

    // Audit log - Break Glass
    await this.auditService.log({
      tenantId: undefined,
      userId: admin.userId,
      userRole: 'system_admin',
      action: 'system_admin:session_access',
      resourceType: 'sessions',
      resourceId: targetUserId,
      details: {
        type: 'BREAK_GLASS',
        targetUserId,
        operationType: 'view',
        sessionsViewed: sessions.length,
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return {
      sessions,
      total: sessions.length,
    };
  }

  /**
   * DELETE /admin/users/:userId/sessions
   * Force-logout user from all devices (all tenants)
   */
  @Delete('users/:userId/sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Force-logout user globally',
    description:
      'Invalidates all sessions for a user across all tenants and devices. ' +
      'User must re-login on all devices.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'All user sessions invalidated successfully',
    type: MessageResponseDto,
  })
  @ApiAuthenticatedResponses()
  async forceLogoutUser(
    @Param('userId') targetUserId: string,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    this.logger.warn(
      `[ADMIN] User ${admin.userId} force-logging out user ${targetUserId} globally`,
    );

    const count = await this.sessionInvalidationService.invalidateAllUserSessions(
      targetUserId,
      'system_admin_force_logout',
    );

    // Audit log - Break Glass
    await this.auditService.log({
      tenantId: undefined,
      userId: admin.userId,
      userRole: 'system_admin',
      action: 'system_admin:session_force_logout',
      resourceType: 'sessions',
      resourceId: targetUserId,
      details: {
        type: 'BREAK_GLASS',
        targetUserId,
        operationType: 'force_logout_all',
        sessionsInvalidated: count,
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return {
      message: `User logged out from ${count} session(s) across all tenants`,
    };
  }

  /**
   * DELETE /admin/sessions/:sessionId
   * Force-logout specific session by ID
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Force-logout specific session',
    description:
      'Deletes a specific identity session and all its linked tenant sessions. ' +
      'Logs out the user from that device only.',
  })
  @ApiParam({ name: 'sessionId', description: 'Identity session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Session deleted successfully',
    type: MessageResponseDto,
  })
  @ApiNotFoundError('Session not found')
  @ApiAuthenticatedResponses()
  async forceLogoutSession(
    @Param() params: SessionIdParamDto,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    this.logger.warn(
      `[ADMIN] User ${admin.userId} force-logging out session ${params.sessionId}`,
    );

    // Get session details before deletion (for audit log)
    const session = await this.sessionService.getIdentitySession(params.sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const deleted = await this.sessionService.deleteIdentitySession(
      params.sessionId,
      session.userId,
    );

    if (!deleted) {
      throw new NotFoundException('Session not found');
    }

    // Audit log - Break Glass
    await this.auditService.log({
      tenantId: undefined,
      userId: admin.userId,
      userRole: 'system_admin',
      action: 'system_admin:session_force_logout',
      resourceType: 'session',
      resourceId: params.sessionId,
      details: {
        type: 'BREAK_GLASS',
        targetUserId: session.userId,
        targetEmail: session.email,
        sessionId: params.sessionId,
        operationType: 'force_logout_specific',
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return {
      message: 'Session deleted successfully',
    };
  }

  /**
   * GET /admin/tenants/:tenantId/sessions
   * View all sessions in a tenant (sanitized)
   */
  @Get('tenants/:tenantId/sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] View tenant sessions (sanitized)',
    description:
      'Returns all active sessions in a specific tenant. ' +
      'Data is sanitized (device info, location, timestamps only).',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant sessions retrieved successfully (sanitized)',
    type: SessionListResponseDto,
  })
  @ApiAuthenticatedResponses()
  async getTenantSessions(
    @Param('tenantId') tenantId: string,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
  ): Promise<SessionListResponseDto> {
    this.logger.warn(
      `[ADMIN] User ${admin.userId} accessing sessions for tenant ${tenantId}`,
    );

    // Get all tenant sessions for this tenant using SCAN
    const redis = this.sessionService['redisService'].getClient();
    const stream = redis.scanStream({
      match: 'complytude:tenant-session:*',
      count: 100,
    });

    const tenantSessionIds: string[] = [];

    stream.on('data', (keys: string[]) => {
      tenantSessionIds.push(...keys);
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    // Filter sessions by tenantId and enrich with identity session data
    const sessions: SessionListItemDto[] = [];

    for (const key of tenantSessionIds) {
      const sessionData = await redis.hgetall(key);
      
      if (sessionData && sessionData.tenantId === tenantId) {
        const sessionId = key.replace('complytude:tenant-session:', '');
        
        // Get parent identity session for device info
        const identitySession = await this.sessionService.getIdentitySession(
          sessionData.identitySessionId,
        );

        if (identitySession) {
          sessions.push({
            sessionId: sessionData.identitySessionId,
            sessionType: 'tenant',
            deviceInfo: identitySession.deviceInfo,
            ipAddress: identitySession.ipAddress,
            geoLocation: identitySession.geoLocation,
            sessionName: identitySession.sessionName,
            tenantId: sessionData.tenantId,
            createdAt: sessionData.createdAt,
            lastActivityAt: sessionData.lastActivityAt,
            isCurrentSession: false,
          });
        }
      }
    }

    // Audit log - Break Glass
    await this.auditService.log({
      tenantId,
      userId: admin.userId,
      userRole: 'system_admin',
      action: 'system_admin:session_access',
      resourceType: 'sessions',
      resourceId: tenantId,
      details: {
        type: 'BREAK_GLASS',
        targetTenantId: tenantId,
        operationType: 'view',
        sessionsViewed: sessions.length,
      },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return {
      sessions,
      total: sessions.length,
    };
  }
}

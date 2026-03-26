import { AuditService } from '@lib/audit';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import { SwaggerCookieAuth } from 'src/common/swagger';
import { AuthOptions } from './decorators/auth-options.decorator';
import { CurrentUserIdentity } from './decorators/current-user.decorator';
import {
  AdminSessionListResponseDto,
  AdminSessionStatsResponseDto,
} from './dto/admin-session.dto';
import { SessionInvalidationService } from './services/session-invalidation.service';
import { SessionService } from './services/session.service';
import type { AuthenticatedIdentityUser } from './strategies';

/**
 * System admin session management (break-glass). Requires identity token +
 * `platformRole === system_admin` (see SystemAdminGuard).
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

  private requestMeta(req: FastifyRequest): {
    ipAddress?: string;
    userAgent?: string;
  } {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return {
      ipAddress: typeof ip === 'string' ? ip : undefined,
      userAgent: typeof ua === 'string' ? ua : undefined,
    };
  }

  @Get('sessions/stats')
  @ApiOperation({
    summary: '[ADMIN] Global session statistics',
    description:
      'Returns counts of active identity and tenant sessions, breakdown by tenant and device type. Audited (break-glass).',
  })
  @ApiResponse({ status: 200, type: AdminSessionStatsResponseDto })
  @ApiResponse({ status: 403, description: 'Not system admin' })
  async getSessionStats(
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
    @Req() req: FastifyRequest,
  ): Promise<AdminSessionStatsResponseDto> {
    const stats = await this.sessionService.getGlobalSessionStats();
    const { ipAddress, userAgent } = this.requestMeta(req);
    await this.auditService.log({
      actorId: admin.userId,
      actorType: 'user',
      userRole: 'system_admin',
      action: 'SYSTEM_ADMIN_SESSION_ACCESS',
      resourceType: 'sessions',
      resourceId: 'global-stats',
      details: {
        type: 'BREAK_GLASS',
        operationType: 'view',
        scope: 'global_stats',
      },
      ipAddress,
      userAgent,
    });
    this.logger.log(`[ADMIN] Session stats by ${admin.userId}`);
    return stats;
  }

  @Get('tenants/:tenantId/sessions')
  @ApiOperation({
    summary: '[ADMIN] List sessions in tenant',
    description:
      'Sanitized session list for a tenant (device, IP, geo, timestamps, tenant id). Audited (break-glass).',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiResponse({ status: 200, type: AdminSessionListResponseDto })
  @ApiResponse({ status: 403, description: 'Not system admin' })
  async listTenantSessions(
    @Param('tenantId', new ParseUUIDPipe({ version: '4' })) tenantId: string,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
    @Req() req: FastifyRequest,
  ): Promise<AdminSessionListResponseDto> {
    const data =
      await this.sessionService.getSanitizedSessionsForTenant(tenantId);
    const { ipAddress, userAgent } = this.requestMeta(req);
    await this.auditService.log({
      tenantId,
      actorId: admin.userId,
      actorType: 'user',
      userRole: 'system_admin',
      action: 'SYSTEM_ADMIN_SESSION_ACCESS',
      resourceType: 'sessions',
      resourceId: tenantId,
      details: {
        type: 'BREAK_GLASS',
        targetTenantId: tenantId,
        operationType: 'view',
      },
      ipAddress,
      userAgent,
    });
    return data;
  }

  @Get('users/:userId/sessions')
  @ApiOperation({
    summary: '[ADMIN] List user sessions (all tenants)',
    description:
      'Sanitized sessions for a user across all tenants. Audited (break-glass).',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, type: AdminSessionListResponseDto })
  @ApiResponse({ status: 403, description: 'Not system admin' })
  async listUserSessions(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
    @Req() req: FastifyRequest,
  ): Promise<AdminSessionListResponseDto> {
    const data = await this.sessionService.getSanitizedSessionsForUser(userId);
    const { ipAddress, userAgent } = this.requestMeta(req);
    await this.auditService.log({
      actorId: admin.userId,
      actorType: 'user',
      userRole: 'system_admin',
      action: 'SYSTEM_ADMIN_SESSION_ACCESS',
      resourceType: 'sessions',
      resourceId: userId,
      details: {
        type: 'BREAK_GLASS',
        targetUserId: userId,
        operationType: 'view',
      },
      ipAddress,
      userAgent,
    });
    return data;
  }

  @Delete('users/:userId/sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Force logout user globally',
    description:
      'Invalidates all Redis sessions for the user (all devices, all tenants). Audited (break-glass).',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 403, description: 'Not system admin' })
  async forceLogoutUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponseDto> {
    await this.sessionInvalidationService.invalidateAllUserSessions(userId);
    const { ipAddress, userAgent } = this.requestMeta(req);
    await this.auditService.log({
      actorId: admin.userId,
      actorType: 'user',
      userRole: 'system_admin',
      action: 'SYSTEM_ADMIN_SESSION_ACCESS',
      resourceType: 'sessions',
      resourceId: userId,
      details: {
        type: 'BREAK_GLASS',
        targetUserId: userId,
        operationType: 'force_logout',
        scope: 'all_user_sessions',
      },
      ipAddress,
      userAgent,
    });
    this.logger.warn(`[ADMIN] Global force logout for user ${userId}`);
    return { message: 'All user sessions invalidated successfully' };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Force logout specific session',
    description:
      'Deletes identity or tenant session by id (identity cascades tenant sessions). Audited (break-glass).',
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 403, description: 'Not system admin' })
  async forceLogoutSession(
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @CurrentUserIdentity() admin: AuthenticatedIdentityUser,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponseDto> {
    await this.sessionService.deleteAnySessionById(sessionId);
    const { ipAddress, userAgent } = this.requestMeta(req);
    await this.auditService.log({
      actorId: admin.userId,
      actorType: 'user',
      userRole: 'system_admin',
      action: 'SYSTEM_ADMIN_SESSION_ACCESS',
      resourceType: 'sessions',
      resourceId: sessionId,
      details: {
        type: 'BREAK_GLASS',
        operationType: 'force_logout',
        targetSessionId: sessionId,
      },
      ipAddress,
      userAgent,
    });
    this.logger.warn(`[ADMIN] Force logout session ${sessionId}`);
    return { message: 'Session invalidated successfully' };
  }
}

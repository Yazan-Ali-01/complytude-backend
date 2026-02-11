import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import {
  ApiAuthenticatedResponses,
  ApiNotFoundError,
  ApiValidationError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { SessionInvalidationService } from 'src/modules/sessions/services/session-invalidation.service';
import { SessionService } from 'src/modules/sessions/services/session.service';
import { AuthOptions } from '../decorators/auth-options.decorator';
import {
  CurrentUserIdentity,
  CurrentUserTenant,
} from '../decorators/current-user.decorator';
import { RenameSessionDto } from '../dto/rename-session.dto';
import { SessionIdParamDto } from '../dto/session-id-param.dto';
import {
  SessionListItemDto,
  SessionListResponseDto,
} from '../dto/session-response.dto';
import type {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../strategies';

/**
 * SessionsController - User session management endpoints
 *
 * Handles:
 * - List user's active sessions (current tenant or all tenants)
 * - Logout from specific device
 * - Logout from all devices (current tenant or all tenants)
 * - Rename sessions
 *
 * Authentication: Requires identity token (for cross-tenant operations) or tenant token
 */
@ApiTags('Sessions')
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionInvalidationService: SessionInvalidationService,
  ) {}

  /**
   * GET /auth/sessions
   * List user's active sessions for current tenant
   */
  @Get()
  @AuthOptions({ tenant: true })
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List my active sessions (current tenant)',
    description:
      'Returns all active sessions for the authenticated user in the current tenant. ' +
      'Shows device info, location, and last activity for each session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session list retrieved successfully',
    type: SessionListResponseDto,
  })
  @ApiAuthenticatedResponses()
  async listCurrentTenantSessions(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<SessionListResponseDto> {
    // Get all tenant sessions for user in current tenant
    const tenantSessions = await this.sessionService.getUserTenantSessions(
      user.userId,
      user.tenantId,
    );

    // Get identity sessions to enrich with device info
    const identitySessions = await this.sessionService.getUserIdentitySessions(
      user.userId,
    );

    const sessions: SessionListItemDto[] = [];

    // Map tenant sessions to response format
    for (const tenantSession of tenantSessions) {
      // Find parent identity session by matching sessionId
      // BUG FIX: tenantSession.identitySessionId is an identity session UUID,
      // must compare with identitySession.sessionId (not activeTenantSessionIds array)
      const identitySession = identitySessions.find(
        (is) => is.sessionId === tenantSession.identitySessionId,
      );

      if (identitySession) {
        sessions.push({
          sessionId: tenantSession.sessionId, // Tenant session ID (for logout operations)
          sessionType: 'tenant',
          deviceInfo: identitySession.deviceInfo,
          ipAddress: identitySession.ipAddress,
          geoLocation: identitySession.geoLocation,
          sessionName: identitySession.sessionName,
          tenantId: tenantSession.tenantId,
          createdAt: tenantSession.createdAt,
          lastActivityAt: tenantSession.lastActivityAt,
          isCurrentSession: user.sessionId === tenantSession.sessionId,
        });
      }
    }

    return {
      sessions,
      total: sessions.length,
    };
  }

  /**
   * GET /auth/sessions/all
   * List user's active tenant sessions across all tenants
   */
  @Get('all')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List my active sessions (all tenants)',
    description:
      'Returns all active tenant sessions for the authenticated user across all tenants. ' +
      'Shows which tenants you are logged into, from which devices.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session list retrieved successfully',
    type: SessionListResponseDto,
  })
  @ApiAuthenticatedResponses()
  async listAllSessions(
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
  ): Promise<SessionListResponseDto> {
    // Get all identity sessions (devices) to enrich with device info
    const identitySessions = await this.sessionService.getUserIdentitySessions(
      user.userId,
    );

    // Get all tenant sessions across ALL tenants
    // We need to scan all tenant sessions for this user across all tenants
    const allTenantSessions: SessionListItemDto[] = [];

    // For each identity session, get all its tenant sessions
    for (const identitySession of identitySessions) {
      for (const tenantSessionId of identitySession.activeTenantSessionIds) {
        const tenantSession =
          await this.sessionService.getTenantSession(tenantSessionId);

        if (tenantSession) {
          allTenantSessions.push({
            sessionId: tenantSession.sessionId,
            sessionType: 'tenant',
            deviceInfo: identitySession.deviceInfo,
            ipAddress: identitySession.ipAddress,
            geoLocation: identitySession.geoLocation,
            sessionName: identitySession.sessionName,
            tenantId: tenantSession.tenantId,
            createdAt: tenantSession.createdAt,
            lastActivityAt: tenantSession.lastActivityAt,
            isCurrentSession: user.sessionId === identitySession.sessionId,
          });
        }
      }
    }

    return {
      sessions: allTenantSessions,
      total: allTenantSessions.length,
    };
  }

  /**
   * DELETE /auth/sessions/:sessionId
   * Logout from a specific device (identity session)
   */
  @Delete(':sessionId')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout from specific device',
    description:
      'Delete a specific identity session (and all its linked tenant sessions). ' +
      'This logs out the user from that device only.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Identity session UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Session deleted successfully',
    type: MessageResponseDto,
  })
  @ApiNotFoundError('Session not found')
  @ApiValidationError()
  @ApiAuthenticatedResponses()
  async deleteSession(
    @Param() params: SessionIdParamDto,
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    const deleted = await this.sessionService.deleteIdentitySession(
      params.sessionId,
      user.userId,
    );

    if (!deleted) {
      throw new NotFoundException('Session not found');
    }

    return {
      message:
        'Session deleted successfully. You have been logged out from that device.',
    };
  }

  /**
   * DELETE /auth/sessions
   * Logout from all devices for current tenant only
   */
  @Delete()
  @AuthOptions({ tenant: true })
  @SwaggerCookieAuth.tenantAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout from all devices (current tenant)',
    description:
      'Delete all tenant sessions for the current tenant. ' +
      'Identity sessions remain active (can still switch to other tenants).',
  })
  @ApiResponse({
    status: 200,
    description: 'All tenant sessions deleted successfully',
    type: MessageResponseDto,
  })
  @ApiAuthenticatedResponses()
  async deleteAllCurrentTenantSessions(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    const count =
      await this.sessionInvalidationService.invalidateUserTenantSessions(
        user.userId,
        user.tenantId,
        'user_logout_all_current_tenant',
      );

    return {
      message: `Logged out from ${count} session(s) in current tenant`,
    };
  }

  /**
   * DELETE /auth/sessions/all
   * Logout from all devices (all tenants)
   * Implemented as a POST for better HTTP semantics with identity token requirement
   */
  @Delete('all')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout from all devices (all tenants)',
    description:
      'Delete all identity sessions (and all linked tenant sessions). ' +
      'User must re-login on all devices to regain access.',
  })
  @ApiResponse({
    status: 200,
    description: 'All sessions deleted successfully',
    type: MessageResponseDto,
  })
  @ApiAuthenticatedResponses()
  async deleteAllSessions(
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    const count =
      await this.sessionInvalidationService.invalidateAllUserSessions(
        user.userId,
        'user_logout_all_devices',
      );

    return {
      message: `Logged out from ${count} device(s) across all tenants`,
    };
  }

  /**
   * PATCH /auth/sessions/:sessionId
   * Rename a session
   */
  @Patch(':sessionId')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rename session',
    description:
      'Set a user-friendly name for a session (e.g., "My MacBook Pro", "Work iPhone"). ' +
      'Helps identify devices in session list.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Identity session UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Session renamed successfully',
    type: MessageResponseDto,
  })
  @ApiNotFoundError('Session not found')
  @ApiValidationError()
  @ApiAuthenticatedResponses()
  async renameSession(
    @Param() params: SessionIdParamDto,
    @Body() dto: RenameSessionDto,
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    // Verify session belongs to user
    const session = await this.sessionService.getIdentitySession(
      params.sessionId,
    );

    if (!session || session.userId !== user.userId) {
      throw new NotFoundException('Session not found');
    }

    const renamed = await this.sessionService.renameIdentitySession(
      params.sessionId,
      dto.sessionName,
    );

    if (!renamed) {
      throw new NotFoundException('Session not found');
    }

    return {
      message: 'Session renamed successfully',
    };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Audit } from 'src/common/decorators/audit.decorator';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import {
  ApiAuthenticatedResponses,
  ApiConflictError,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiValidationError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { SystemTenantRole } from 'src/common/types';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedTenantUser } from '../auth/strategies/jwt-payload.interface';
import { InvitationsService } from '../invitations/invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationListQueryDto } from './dto/invitation-list-query.dto';
import {
  CreateInvitationResponseDto,
  InvitationResponseDto,
  ResendInvitationResponseDto,
} from './dto/invitation-response.dto';

/**
 * Tenant-scoped invitation management endpoints
 * Requires tenant admin permissions
 */
@ApiTags('Tenant - Invitations')
@Controller('tenants/admin/invitations')
@AuthOptions({ tenant: true })
@UseGuards(RolesGuard)
@Roles(SystemTenantRole.TENANT_ADMIN)
@SwaggerCookieAuth.tenantAccessToken()
export class TenantInvitationsController {
  private readonly logger = new Logger(TenantInvitationsController.name);

  constructor(private readonly invitationsService: InvitationsService) {}

  /**
   * Create a new invitation to join the tenant
   */
  @Post()
  @ApiOperation({
    summary: 'Create invitation',
    description:
      'Invite a user to join the tenant. Requires tenant admin permissions. Returns a token to be sent via email.',
  })
  @ApiResponse({
    status: 201,
    description: 'Invitation created successfully',
    type: CreateInvitationResponseDto,
  })
  @ApiValidationError()
  @ApiConflictError('User already member or pending invitation exists')
  @ApiForbiddenError('Requires tenant admin permissions')
  @ApiAuthenticatedResponses()
  async createInvitation(
    @Body() createInvitationDto: CreateInvitationDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<CreateInvitationResponseDto> {
    this.logger.log(
      `Admin ${user.userId} creating invitation for ${createInvitationDto.email} to tenant ${user.tenantId}`,
    );

    // Lookup role ID from role key
    const roleKey = createInvitationDto.roleKey ?? SystemTenantRole.MEMBER;
    const roleResult = await this.invitationsService.getRoleIdByKey(
      roleKey,
      user.tenantId,
    );

    if (!roleResult) {
      throw new BadRequestException(`Invalid role: ${roleKey}`);
    }

    const result = await this.invitationsService.createInvitation({
      tenantId: user.tenantId,
      invitedBy: user.userId,
      email: createInvitationDto.email,
      roleId: roleResult.id,
    });

    // TODO: Send email with token
    this.logger.log(
      `Invitation created: ${result.invitationId}. Token (for email): ${result.token}`,
    );

    return {
      invitationId: result.invitationId,
      token: result.token,
      message: 'Invitation created successfully',
    };
  }

  /**
   * List invitations for the tenant
   */
  @Get()
  @ApiOperation({
    summary: 'List tenant invitations',
    description:
      'Retrieve paginated list of invitations for the tenant. Supports filtering by status and email. Requires tenant admin permissions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitations list retrieved successfully',
    type: [InvitationResponseDto],
  })
  @ApiForbiddenError('Requires tenant admin permissions')
  @ApiAuthenticatedResponses()
  async listInvitations(
    @Query() query: InvitationListQueryDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ) {
    this.logger.log(`Listing invitations for tenant ${user.tenantId}`);

    return this.invitationsService.listTenantInvitations(
      user.tenantId,
      {
        email: query.email,
        status: query.status,
      },
      {
        cursor: query.cursor,
        limit: query.limit,
        direction: query.direction,
      },
    );
  }

  /**
   * Resend invitation (generate new token)
   */
  @Post(':invitationId/resend')
  @HttpCode(HttpStatus.OK)
  @Audit('INVITATION_RESEND', { resourceIdParam: 'invitationId' })
  @ApiOperation({
    summary: 'Resend invitation',
    description:
      'Generate a new token for an existing invitation and extend expiration. Requires tenant admin permissions.',
  })
  @ApiParam({
    name: 'invitationId',
    description: 'Invitation UUID',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation resent successfully',
    type: ResendInvitationResponseDto,
  })
  @ApiNotFoundError('Invitation not found')
  @ApiForbiddenError('Requires tenant admin permissions')
  @ApiAuthenticatedResponses()
  async resendInvitation(
    @Param('invitationId') invitationId: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<ResendInvitationResponseDto> {
    this.logger.log(
      `Admin ${user.userId} resending invitation ${invitationId} for tenant ${user.tenantId}`,
    );

    const result = await this.invitationsService.resendInvitation(
      invitationId,
      user.tenantId,
    );

    // TODO: Send email with new token
    this.logger.log(
      `Invitation ${invitationId} resent. New token (for email): ${result.token}`,
    );

    return {
      token: result.token,
      message: 'Invitation resent successfully',
    };
  }

  /**
   * Revoke invitation
   */
  @Delete(':invitationId')
  @HttpCode(HttpStatus.OK)
  @Audit('INVITATION_REVOKE', { resourceIdParam: 'invitationId' })
  @ApiOperation({
    summary: 'Revoke invitation',
    description:
      'Revoke a pending invitation. Invitation cannot be used after revocation. Requires tenant admin permissions.',
  })
  @ApiParam({
    name: 'invitationId',
    description: 'Invitation UUID',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation revoked successfully',
    type: MessageResponseDto,
  })
  @ApiNotFoundError('Invitation not found')
  @ApiForbiddenError('Requires tenant admin permissions')
  @ApiAuthenticatedResponses()
  async revokeInvitation(
    @Param('invitationId') invitationId: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    this.logger.log(
      `Admin ${user.userId} revoking invitation ${invitationId} for tenant ${user.tenantId}`,
    );

    return this.invitationsService.revokeInvitation(
      invitationId,
      user.tenantId,
      user.userId,
    );
  }
}

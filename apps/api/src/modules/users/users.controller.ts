import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import {
  ApiArrayResponses,
  ApiAuthenticatedResponses,
  ApiGetResponses,
  ApiUpdateResponses,
  ApiValidationError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import {
  CurrentUserIdentity,
  CurrentUserTenant,
} from '../auth/decorators/current-user.decorator';
import type {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../auth/strategies';
import { UsersI18n } from './constants/i18n.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  TenantInfoResponseDto,
  UserProfileResponseDto,
  UserTenantResponseDto,
} from './dto/user-response.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

/** The signed-in user's own account: identity token, except the current-tenant lookup. */
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly i18n: I18nService,
  ) {}

  @Get('me')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieve the authenticated user profile with all details',
  })
  @ApiGetResponses(UserProfileResponseDto, 'User profile')
  async getProfile(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<UserProfileResponseDto> {
    return this.mapProfile(await this.usersService.findById(identity.userId));
  }

  @Patch('me')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @Audit('USER_PROFILE_UPDATED', { resourceType: 'users' })
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Update first name and/or last name of the authenticated user',
  })
  @ApiUpdateResponses(UserProfileResponseDto, 'User profile')
  async updateProfile(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.mapProfile(
      await this.usersService.updateProfile(identity.userId, dto),
    );
  }

  @Patch('me/password')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @Audit('USER_PASSWORD_CHANGED', { resourceType: 'users' })
  @ApiOperation({
    summary: 'Change password',
    description:
      'Change the authenticated user password. Requires the current password. Every other session of the user (all devices, all tenants) is signed out; the one making the change stays signed in.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiResponse({
    status: 400,
    description:
      'Current password is incorrect, or the account has no local password (SSO)',
  })
  @ApiAuthenticatedResponses()
  async changePassword(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    await this.usersService.changePassword(
      identity.userId,
      identity.sessionId,
      dto,
    );
    return { message: this.i18n.t(UsersI18n.messages.PASSWORD_CHANGED) };
  }

  @Get('me/tenants')
  @AuthOptions({ identity: true })
  @SwaggerCookieAuth.identityAccessToken()
  @ApiOperation({
    summary: 'List user tenants',
    description:
      'Retrieve the tenants the authenticated user can switch into, with their roles',
  })
  @ApiArrayResponses(UserTenantResponseDto, 'User tenants')
  async getUserTenants(
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<UserTenantResponseDto[]> {
    const memberships = await this.usersService.getUserTenants(identity.userId);
    return memberships.map((membership) => ({
      tenantId: membership.tenant_id,
      tenantName: membership.tenant_name ?? '',
      role: membership.role_key,
      roleName: membership.role_name,
      isActive: membership.is_active,
      joinedAt: new Date(membership.joined_at).toISOString(),
    }));
  }

  @Get('me/current-tenant')
  @AuthOptions({ tenant: true })
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: 'Get current tenant info',
    description:
      'Retrieve information about the current tenant resolved from JWT token',
  })
  @ApiGetResponses(TenantInfoResponseDto, 'Current tenant')
  async getCurrentTenant(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantInfoResponseDto> {
    return new TenantInfoResponseDto(
      await this.usersService.getCurrentTenant(user.tenantId),
    );
  }

  private mapProfile(user: User): UserProfileResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isVerified: user.is_verified,
      platformRole: user.platform_role_key,
      createdAt: new Date(user.created_at).toISOString(),
      updatedAt: new Date(user.updated_at).toISOString(),
    };
  }
}

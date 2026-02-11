import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import {
  ApiArrayResponses,
  ApiAuthenticatedResponses,
  ApiGetResponses,
  ApiUpdateResponses,
  ApiValidationError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserIdentity } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedIdentityUser } from '../auth/strategies';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  TenantInfoResponseDto,
  UserProfileResponseDto,
  UserTenantResponseDto,
} from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * UsersController - User profile and settings management
 *
 * Architecture:
 * - Controller: HTTP layer (request/response handling)
 * - Service: Business logic (data operations, validation)
 * - Uses identity token (user-level operations, not tenant-specific)
 *
 * Security:
 * - All endpoints require identity token (user authentication)
 * - User ID comes from JWT token (not from URL parameters)
 * - Follows principle: "Don't accept from user what's in auth token"
 *
 * Why Identity Token (not Tenant Token):
 * - Profile/password are user-level operations
 * - User might not have selected a tenant yet
 * - Tenant list endpoint needs to work before tenant selection
 */
@ApiTags('Users')
@Controller('users')
@AuthOptions({ identity: true })
@SwaggerCookieAuth.identityAccessToken()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Get current user profile
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieve the authenticated user profile with all details',
  })
  @ApiGetResponses(UserProfileResponseDto, 'User profile')
  async getProfile(
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
  ): Promise<UserProfileResponseDto> {
    // Delegate to service layer
    const userProfile = await this.usersService.findById(user.userId);

    // Map snake_case entity fields to camelCase DTO fields
    return {
      id: userProfile.id,
      email: userProfile.email,
      firstName: userProfile.first_name,
      lastName: userProfile.last_name,
      isVerified: userProfile.is_verified,
      isSystemAdmin: userProfile.is_system_admin,
      createdAt: userProfile.created_at.toISOString(),
      updatedAt: userProfile.updated_at.toISOString(),
    };
  }

  /**
   * PATCH /users/me
   * Update current user profile (including email - triggers session invalidation)
   */
  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Update first name, last name, and/or email. ' +
      'Email changes invalidate all sessions for security.',
  })
  @ApiUpdateResponses(UserProfileResponseDto, 'User profile')
  @ApiValidationError()
  async updateProfile(
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    // Delegate to service layer (handles email change session invalidation)
    const updatedUser = await this.usersService.updateProfile(user.userId, dto);

    // Map snake_case entity fields to camelCase DTO fields
    return {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.first_name,
      lastName: updatedUser.last_name,
      isVerified: updatedUser.is_verified,
      isSystemAdmin: updatedUser.is_system_admin,
      createdAt: updatedUser.created_at.toISOString(),
      updatedAt: updatedUser.updated_at.toISOString(),
    };
  }

  /**
   * PATCH /users/me/password
   * Change password (invalidates all sessions for security)
   */
  @Patch('me/password')
  @ApiOperation({
    summary: 'Change password',
    description:
      'Change the authenticated user password. Requires current password verification. ' +
      'All sessions are invalidated for security.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully. All sessions invalidated.',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiResponse({
    status: 400,
    description: 'Current password is incorrect',
  })
  @ApiAuthenticatedResponses()
  async changePassword(
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    // Delegate to service layer (handles session invalidation)
    await this.usersService.changePassword(user.userId, dto);

    return {
      message:
        'Password changed successfully. You have been logged out from all devices.',
    };
  }

  /**
   * GET /users/me/tenants
   * List user tenants with roles
   */
  @Get('me/tenants')
  @ApiOperation({
    summary: 'List user tenants',
    description:
      'Retrieve all tenants the authenticated user belongs to with their roles',
  })
  @ApiArrayResponses(UserTenantResponseDto, 'User tenants')
  async getUserTenants(
    @CurrentUserIdentity() user: AuthenticatedIdentityUser,
  ): Promise<UserTenantResponseDto[]> {
    // Delegate to service layer
    const userTenants = await this.usersService.getUserTenants(user.userId);

    return userTenants.map((ut) => ({
      tenantId: ut.tenant_id,
      tenantName: `Tenant ${ut.tenant_id.substring(0, 8)}`, // TODO: Get actual tenant name
      role: ut.role_key,
      roleName: ut.role_name,
      isActive: ut.is_active,
      joinedAt: ut.joined_at,
    }));
  }

  /**
   * GET /users/me/current-tenant
   * Get current tenant info from JWT token
   *
   * Note: This endpoint is deprecated/simplified.
   * Use GET /tenants/me for full tenant details with features.
   */
  @Get('me/current-tenant')
  @ApiOperation({
    summary: 'Get current tenant info',
    description:
      'Retrieve basic information about the current tenant from JWT token. ' +
      'For full tenant details with features, use GET /tenants/me instead.',
  })
  @ApiGetResponses(TenantInfoResponseDto, 'Current tenant')
  async getCurrentTenant(
    @CurrentUserIdentity() _user: AuthenticatedIdentityUser,
  ): Promise<TenantInfoResponseDto> {
    // This endpoint is deprecated
    // User hasn't selected a tenant yet with identity token
    // Redirect to: POST /auth/tenant-switch first, then use GET /tenants/me
    return {
      id: 'no-tenant-selected',
      plan: 'basic',
      features: {
        documentLimit: 0,
        checklistAccess: false,
        analyzerEnabled: false,
      },
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

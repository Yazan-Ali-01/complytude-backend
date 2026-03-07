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
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  TenantInfoResponseDto,
  UserProfileResponseDto,
  UserTenantResponseDto,
} from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@SwaggerCookieAuth.tenantAccessToken()
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
  getProfile(@CurrentUser() _user: AuthenticatedUser): UserProfileResponseDto {
    // Implementation will be added by service layer
    return null as unknown as UserProfileResponseDto;
  }

  /**
   * PATCH /users/me
   * Update current user profile
   */
  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Update first name and/or last name of the authenticated user',
  })
  @ApiUpdateResponses(UserProfileResponseDto, 'User profile')
  updateProfile(
    @CurrentUser() _user: AuthenticatedUser,
    @Body() _dto: UpdateProfileDto,
  ): UserProfileResponseDto {
    // Implementation will be added by service layer
    return null as unknown as UserProfileResponseDto;
  }

  /**
   * PATCH /users/me/password
   * Change password
   */
  @Patch('me/password')
  @ApiOperation({
    summary: 'Change password',
    description:
      'Change the authenticated user password. Requires current password verification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiResponse({
    status: 400,
    description: 'Current password is incorrect',
  })
  @ApiAuthenticatedResponses()
  changePassword(
    @CurrentUser() _user: AuthenticatedUser,
    @Body() _dto: ChangePasswordDto,
  ): MessageResponseDto {
    // Implementation will be added by service layer
    return { message: 'Password changed successfully' };
  }

  /**
   * GET /users/me/tenants
   * List user tenants
   */
  @Get('me/tenants')
  @ApiOperation({
    summary: 'List user tenants',
    description:
      'Retrieve all tenants the authenticated user belongs to with their roles',
  })
  @ApiArrayResponses(UserTenantResponseDto, 'User tenants')
  getUserTenants(
    @CurrentUser() _user: AuthenticatedUser,
  ): UserTenantResponseDto[] {
    // Implementation will be added by service layer
    return [];
  }

  /**
   * GET /users/me/current-tenant
   * Get current tenant info
   */
  @Get('me/current-tenant')
  @ApiOperation({
    summary: 'Get current tenant info',
    description:
      'Retrieve information about the current tenant resolved from JWT token',
  })
  @ApiGetResponses(TenantInfoResponseDto, 'Current tenant')
  getCurrentTenant(
    @CurrentUser() _user: AuthenticatedUser,
  ): TenantInfoResponseDto {
    // Implementation will be added by service layer
    return null as unknown as TenantInfoResponseDto;
  }
}

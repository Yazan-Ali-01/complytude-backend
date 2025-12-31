import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ClassSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { I18nService, I18nContext } from 'nestjs-i18n';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly i18n: I18nService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, updateProfileDto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(user.userId, changePasswordDto);
    return {
      message: this.i18n.t('users.messages.passwordChanged', {
        lang: I18nContext.current()?.lang,
      }),
    };
  }

  @Get('me/tenants')
  @ApiOperation({ summary: 'Get all tenants accessible by current user' })
  @ApiResponse({ status: 200, description: 'List of accessible tenants' })
  async getUserTenants(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getUserTenants(user.userId);
  }

  @Get()
  @Roles('admin', 'member')
  @ApiOperation({ summary: 'List all users in current tenant' })
  @ApiResponse({ status: 200, description: 'List of users in tenant' })
  async listTenantUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listTenantUsers(user.tenantId);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({
    summary: 'Create or invite user to current tenant (admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'User created/invited successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 409, description: 'User already exists in tenant' })
  async createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.createUser(
      user.tenantId,
      user.userId,
      createUserDto,
    );
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user in current tenant (admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found in tenant' })
  async updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') targetUserId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(
      user.tenantId,
      targetUserId,
      user.userId,
      updateUserDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Remove user from current tenant (admin only)' })
  @ApiResponse({ status: 200, description: 'User removed from tenant' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found in tenant' })
  async removeUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') targetUserId: string,
  ) {
    await this.usersService.removeUserFromTenant(
      user.tenantId,
      targetUserId,
      user.userId,
    );
    return {
      message: this.i18n.t('users.messages.userRemoved', {
        lang: I18nContext.current()?.lang,
      }),
    };
  }
}

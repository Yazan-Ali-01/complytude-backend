import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { TENANT_PERMISSIONS } from 'src/common/constants/tenant-permissions.constant';
import { Audit } from 'src/common/decorators/audit.decorator';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import {
  ApiArrayResponses,
  ApiUpdateResponses,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { UserTenantWithUserRow } from 'src/repositories/users/interfaces/user-tenant.intefaces';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { UsersI18n } from './constants/i18n.constants';
import { UpdateUserDto } from './dto/update-user.dto';
import { TenantMemberResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * Tenant admin endpoints for the current tenant's members: list them, change a role, turn access
 * off or on, and remove them. Needs team:manage.
 */
@ApiTags('Tenant Admin - Members')
@Controller('tenants/admin/users')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class TenantMembersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.TEAM.MANAGE)
  @ApiOperation({
    summary: 'List tenant members',
    description:
      'Every member of the current tenant, active or not, with their role.',
  })
  @ApiArrayResponses(TenantMemberResponseDto, 'Tenant members')
  async list(
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<TenantMemberResponseDto[]> {
    const members = await this.usersService.listMembers(admin.tenantId);
    return members.map((member) => this.mapMember(member));
  }

  @Patch(':userId')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.TEAM.MANAGE)
  @Audit('TENANT_MEMBER_UPDATED', {
    resourceIdParam: 'userId',
    resourceType: 'users',
    includeBody: true,
  })
  @ApiOperation({
    summary: 'Change a member role or access',
    description:
      "Set a member's role (a system role or one of this tenant's roles) and/or turn their access off or on. Their sessions in this tenant end when the role changes or access is turned off. Only a tenant admin can grant or take away the tenant admin role, nobody can change their own, and the tenant always keeps one active tenant admin.",
  })
  @ApiParam({ name: 'userId', description: 'Member user UUID' })
  @ApiUpdateResponses(TenantMemberResponseDto, 'Tenant member')
  async update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<TenantMemberResponseDto> {
    return this.mapMember(
      await this.usersService.updateMember(
        { userId: admin.userId, tenantId: admin.tenantId, role: admin.role },
        userId,
        dto,
      ),
    );
  }

  @Delete(':userId')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.TEAM.MANAGE)
  @Audit('TENANT_MEMBER_REMOVED', {
    resourceIdParam: 'userId',
    resourceType: 'users',
  })
  @ApiOperation({
    summary: 'Remove a member',
    description:
      'Remove a member from the current tenant and end their sessions in it. You cannot remove yourself or the last active tenant admin.',
  })
  @ApiParam({ name: 'userId', description: 'Member user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Member removed',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 403, description: 'team:manage required' })
  @ApiResponse({ status: 404, description: 'Not a member of this tenant' })
  async remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUserTenant() admin: AuthenticatedTenantUser,
  ): Promise<MessageResponseDto> {
    await this.usersService.removeMember(
      { userId: admin.userId, tenantId: admin.tenantId, role: admin.role },
      userId,
    );
    return { message: this.i18n.t(UsersI18n.messages.MEMBER_REMOVED) };
  }

  private mapMember(member: UserTenantWithUserRow): TenantMemberResponseDto {
    return {
      userId: member.user_id,
      email: member.email,
      firstName: member.first_name,
      lastName: member.last_name,
      isVerified: member.is_verified,
      role: member.role_key,
      roleName: member.role_name,
      isActive: member.is_active,
      joinedAt: new Date(member.joined_at).toISOString(),
    };
  }
}

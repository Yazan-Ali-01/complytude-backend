import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationMetaDto } from 'src/common/dto';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { PLATFORM_PERMISSIONS } from 'src/common/constants/platform-permissions.constant';
import { TENANT_PERMISSIONS } from 'src/common/constants/tenant-permissions.constant';
import { PlatformPermissionsGuard } from 'src/common/guards/platform-permissions.guard';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiForbiddenError,
  ApiListResponses,
  ApiValidationError,
} from 'src/common/swagger/decorators';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { AuditLogsService } from './audit-logs.service';
import {
  AuditLogListResponseDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';
import {
  AdminListAuditLogsQueryDto,
  ListAuditLogsQueryDto,
} from './dto/list-audit-logs-query.dto';

@ApiTags('Audit logs')
@Controller('audit-logs')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
@ApiExtraModels(AuditLogResponseDto, AuditLogListResponseDto, PaginationMetaDto)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission(TENANT_PERMISSIONS.AUDIT.READ)
  @ApiOperation({
    summary: "List the tenant's audit log",
    description:
      "Who did what in this tenant, newest first: sign-ins to it, document, member, billing and settings changes, refused attempts. Only this tenant's rows. Requires audit:read (tenant admins).",
  })
  @ApiListResponses(AuditLogListResponseDto, 'Audit log')
  @ApiValidationError()
  @ApiForbiddenError('Requires audit:read')
  list(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditLogsService.listForTenant(user.tenantId, query);
  }
}

@ApiTags('Audit logs')
@Controller('admin/audit-logs')
@AuthOptions({ identity: true })
@SwaggerCookieAuth.identityAccessToken()
@ApiExtraModels(AuditLogResponseDto, AuditLogListResponseDto, PaginationMetaDto)
export class AdminAuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission(PLATFORM_PERMISSIONS.AUDIT.READ)
  @ApiOperation({
    summary: 'List the whole audit log (platform)',
    description:
      'Every audit row across tenants, including platform-level events (sign-ins, password resets, platform-admin actions), newest first. Requires the audit:read platform permission (system_admin, support, auditor).',
  })
  @ApiListResponses(AuditLogListResponseDto, 'Audit log')
  @ApiValidationError()
  @ApiForbiddenError('Requires the audit:read platform permission')
  list(
    @Query() query: AdminListAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditLogsService.listForPlatform(query);
  }
}

import { Controller, Get, Query, Param, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuditService } from '../../rbac/services/audit.service';
import { AuditQueryDto } from '../dto/audit-query.dto';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import { Permissions } from '../../rbac/constants/permissions.constant';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions(Permissions.SETTINGS.MANAGE)
  @ApiOperation({ summary: 'Get audit logs for the current tenant' })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getAuditLogs(
    @Query() query: AuditQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ logs: unknown[]; total: number }> {
    this.logger.debug(
      `Fetching audit logs for tenant: ${user.tenantId}, action: ${query.action}`,
    );

    const logs = await this.auditService.findByTenant(user.tenantId, query);
    const total = await this.auditService.countByTenant(user.tenantId, query);

    return { logs, total };
  }

  @Get('user/:userId')
  @RequirePermissions(Permissions.SETTINGS.MANAGE)
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  @ApiResponse({
    status: 200,
    description: 'User audit logs retrieved successfully',
  })
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    this.logger.debug(
      `Fetching audit logs for user: ${userId}, tenant: ${user.tenantId}`,
    );

    return this.auditService.findByUser(userId, user.tenantId);
  }

  @Get('recent')
  @RequirePermissions(Permissions.SETTINGS.MANAGE)
  @ApiOperation({ summary: 'Get recent audit logs' })
  @ApiResponse({
    status: 200,
    description: 'Recent audit logs retrieved successfully',
  })
  async getRecentLogs(
    @Query('limit') limit = 10,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    this.logger.debug(
      `Fetching recent audit logs for tenant: ${user.tenantId}`,
    );

    return this.auditService.getRecentActions(user.tenantId, limit);
  }

  @Get('activity/:userId')
  @RequirePermissions(Permissions.SETTINGS.MANAGE)
  @ApiOperation({ summary: 'Get activity summary for a user' })
  async getUserActivity(
    @Param('userId') userId: string,
    @Query('days') days = 7,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, number>> {
    this.logger.debug(
      `Fetching activity summary for user: ${userId}, days: ${days}`,
    );

    return this.auditService.getUserActivitySummary(
      userId,
      user.tenantId,
      days,
    );
  }
}

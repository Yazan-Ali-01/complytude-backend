import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import { UsageTrackingService } from './usage-tracking.service';
import {
  MeteredFeature,
  METERED_FEATURES,
} from './entities/tenant-features.interface';
import {
  UsageQueryDto,
  UsageCheckResponseDto,
  UsageSummaryResponseDto,
  UsageHistoryResponseDto,
  UsageEventResponseDto,
  ResetUsageDto,
} from './dto/usage.dto';

@ApiTags('System Admin - Tenant Usage')
@Controller('admin/tenants/:tenantId/usage')
@UseGuards(SystemAdminGuard)
@SwaggerCookieAuth.accessToken()
export class TenantUsageAdminController {
  private readonly logger = new Logger(TenantUsageAdminController.name);

  constructor(private readonly usageTrackingService: UsageTrackingService) {}

  @Get()
  @ApiOperation({
    summary: '[ADMIN] Get usage summary for a tenant',
    description:
      'Retrieves current usage for all metered features compared to plan limits.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Usage summary retrieved successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getUsageSummary(
    @Param('tenantId') tenantId: string,
  ): Promise<UsageSummaryResponseDto> {
    this.logger.log(`[ADMIN] Fetching usage summary for tenant ${tenantId}`);

    const summary =
      await this.usageTrackingService.getTenantUsageSummary(tenantId);

    return {
      tenantId: summary.tenantId,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      features: summary.features,
    };
  }

  @Get('check/:featureKey')
  @ApiOperation({
    summary: '[ADMIN] Check usage limit for a specific feature',
    description:
      'Checks if a tenant can use a metered feature based on their entitlements and current usage.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({
    name: 'featureKey',
    description: 'Feature key (e.g., documents_per_month)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage check result',
    type: UsageCheckResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid feature key' })
  async checkUsageLimit(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
  ): Promise<UsageCheckResponseDto> {
    this.logger.log(
      `[ADMIN] Checking usage limit for tenant ${tenantId}, feature: ${featureKey}`,
    );

    if (!METERED_FEATURES.includes(featureKey as MeteredFeature)) {
      throw new BadRequestException(
        `Invalid metered feature key: ${featureKey}. Valid keys: ${METERED_FEATURES.join(', ')}`,
      );
    }

    return this.usageTrackingService.checkUsageLimit(
      tenantId,
      featureKey as MeteredFeature,
    );
  }

  @Get('history')
  @ApiOperation({
    summary: '[ADMIN] Get usage history for a tenant',
    description:
      'Retrieves detailed usage event history with optional filters.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiQuery({
    name: 'featureKey',
    required: false,
    description: 'Filter by feature key',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date (ISO 8601)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max records to return (default 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage history retrieved successfully',
    type: Object,
  })
  async getUsageHistory(
    @Param('tenantId') tenantId: string,
    @Query() query: UsageQueryDto,
  ): Promise<UsageHistoryResponseDto> {
    this.logger.log(
      `[ADMIN] Fetching usage history for tenant ${tenantId}, feature: ${query.featureKey}`,
    );

    const result = await this.usageTrackingService.getUsageHistory(tenantId, {
      featureKey: query.featureKey,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
    });

    return {
      events: result.events.map((e) => this.toEventResponseDto(e)),
      total: result.total,
    };
  }

  @Get('records')
  @ApiOperation({
    summary: '[ADMIN] Get all usage records for a tenant',
    description: 'Retrieves all usage records for the current billing period.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Usage records retrieved successfully',
    type: Object,
  })
  async getUsageRecords(@Param('tenantId') tenantId: string): Promise<{
    records: Record<
      string,
      { usageCount: number; periodStart: Date; periodEnd: Date }
    >;
  }> {
    this.logger.log(`[ADMIN] Fetching usage records for tenant ${tenantId}`);

    const records =
      await this.usageTrackingService.getAllUsageRecords(tenantId);

    return {
      records: Object.entries(records).reduce(
        (acc, [key, usage]) => {
          acc[key] = {
            usageCount: usage.usageCount,
            periodStart: usage.periodStart,
            periodEnd: usage.periodEnd,
          };
          return acc;
        },
        {} as Record<
          string,
          { usageCount: number; periodStart: Date; periodEnd: Date }
        >,
      ),
    };
  }

  @Patch(':featureKey/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Reset usage for a feature',
    description:
      'Resets the usage counter for a specific feature to zero (admin operation).',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({ name: 'featureKey', description: 'Feature key to reset' })
  @ApiResponse({
    status: 200,
    description: 'Usage reset successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        tenantId: {
          type: 'string',
          example: '550e8400-e29b-41d4-a716-446655440000',
        },
        featureKey: { type: 'string', example: 'documents_per_month' },
        message: {
          type: 'string',
          example: "Usage for 'documents_per_month' has been reset",
        },
      },
    },
  })
  async resetUsage(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @Body() dto: ResetUsageDto,
  ): Promise<{
    success: boolean;
    tenantId: string;
    featureKey: string;
    message: string;
  }> {
    this.logger.log(
      `[ADMIN] Resetting usage for tenant ${tenantId}, feature: ${featureKey}`,
    );

    await this.usageTrackingService.resetUsage(
      tenantId,
      featureKey,
      dto.reason,
    );

    return {
      success: true,
      tenantId,
      featureKey,
      message: `Usage for '${featureKey}' has been reset`,
    };
  }

  private toEventResponseDto(
    event: UsageEventResponseDto,
  ): UsageEventResponseDto {
    return {
      id: event.id,
      tenantId: event.tenantId,
      featureKey: event.featureKey,
      userId: event.userId,
      eventType: event.eventType,
      delta: event.delta,
      metadata: event.metadata,
      createdAt: event.createdAt,
    };
  }
}

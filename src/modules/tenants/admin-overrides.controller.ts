import {
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
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { OverridesService } from './overrides.service';
import { FeatureOverride } from './entities/feature-override.entity';

class CreateOverrideDto {
  featureKey: string;
  value: unknown;
  reason?: string;
  expiresAt?: string;
}

class BulkCreateOverrideDto {
  overrides: CreateOverrideDto[];
  reason?: string;
}

class OverrideResponseDto {
  id: string;
  tenantId: string;
  featureKey: string;
  value: unknown;
  grantedBy: string | null;
  grantedAt: Date;
  reason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

class OverrideListResponseDto {
  overrides: OverrideResponseDto[];
  total: number;
}

class RevokeOverrideResponseDto {
  success: boolean;
  tenantId: string;
  featureKey: string;
  message: string;
}

@ApiTags('System Admin - Tenant Overrides')
@Controller('admin/tenants/:tenantId/overrides')
@UseGuards(SystemAdminGuard)
@SwaggerCookieAuth.accessToken()
export class TenantOverridesAdminController {
  private readonly logger = new Logger(TenantOverridesAdminController.name);

  constructor(private readonly overridesService: OverridesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[ADMIN] Grant feature override to tenant',
    description:
      'Creates or updates a feature override for a tenant with audit trail. Supports time-limited overrides.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 201,
    description: 'Override granted successfully',
    type: Object,
  })
  @ApiResponse({ status: 400, description: 'Invalid feature key or value' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async grantOverride(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateOverrideDto,
    @CurrentUser() user: { id: string },
  ): Promise<OverrideResponseDto> {
    this.logger.log(
      `[ADMIN] Granting override for tenant ${tenantId}, feature: ${dto.featureKey}`,
    );

    const override = await this.overridesService.grantOverride(
      tenantId,
      {
        featureKey: dto.featureKey,
        value: dto.value,
        reason: dto.reason,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      user.id,
    );

    return this.toResponseDto(override);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[ADMIN] Grant multiple feature overrides to tenant',
    description: 'Creates multiple feature overrides in a single request.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 201,
    description: 'Overrides granted successfully',
    type: Object,
  })
  async grantBulkOverrides(
    @Param('tenantId') tenantId: string,
    @Body() dto: BulkCreateOverrideDto,
    @CurrentUser() user: { id: string },
  ): Promise<OverrideListResponseDto> {
    this.logger.log(
      `[ADMIN] Granting ${dto.overrides.length} bulk overrides for tenant ${tenantId}`,
    );

    const overrides = await Promise.all(
      dto.overrides.map((override) =>
        this.overridesService.grantOverride(
          tenantId,
          {
            featureKey: override.featureKey,
            value: override.value,
            reason: dto.reason || override.reason,
            expiresAt: override.expiresAt
              ? new Date(override.expiresAt)
              : undefined,
          },
          user.id,
        ),
      ),
    );

    return {
      overrides: overrides.map((o) => this.toResponseDto(o)),
      total: overrides.length,
    };
  }

  @Get()
  @ApiOperation({
    summary: '[ADMIN] List tenant overrides',
    description:
      'Retrieves all feature overrides for a tenant. Use includeExpired=true to see expired overrides.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiQuery({
    name: 'includeExpired',
    required: false,
    type: Boolean,
    description: 'Include expired overrides (default: false)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of overrides',
    type: Object,
  })
  async getOverrides(
    @Param('tenantId') tenantId: string,
    @Query('includeExpired') includeExpired?: string,
  ): Promise<OverrideListResponseDto> {
    this.logger.log(
      `[ADMIN] Fetching overrides for tenant ${tenantId}, includeExpired: ${includeExpired}`,
    );

    const overrides = await this.overridesService.getTenantOverrides(
      tenantId,
      includeExpired === 'true',
    );

    return {
      overrides: overrides.map((o) => this.toResponseDto(o)),
      total: overrides.length,
    };
  }

  @Get(':featureKey')
  @ApiOperation({
    summary: '[ADMIN] Get specific override',
    description: 'Retrieves a specific feature override for a tenant.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({ name: 'featureKey', description: 'Feature key' })
  @ApiResponse({
    status: 200,
    description: 'Override details',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Override not found' })
  async getOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
  ): Promise<OverrideResponseDto | null> {
    this.logger.log(
      `[ADMIN] Fetching override for tenant ${tenantId}, feature: ${featureKey}`,
    );

    const override = await this.overridesService.getActiveOverride(
      tenantId,
      featureKey,
    );

    if (!override) {
      return null;
    }

    return this.toResponseDto(override);
  }

  @Delete(':featureKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Revoke feature override',
    description:
      'Removes a feature override from a tenant. The tenant will revert to plan defaults.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({ name: 'featureKey', description: 'Feature key to revoke' })
  @ApiResponse({
    status: 200,
    description: 'Override revoked successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Override not found' })
  async revokeOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
  ): Promise<RevokeOverrideResponseDto> {
    this.logger.log(
      `[ADMIN] Revoking override for tenant ${tenantId}, feature: ${featureKey}`,
    );

    await this.overridesService.revokeOverride(tenantId, featureKey);

    return {
      success: true,
      tenantId,
      featureKey,
      message: `Override for '${featureKey}' has been revoked`,
    };
  }

  private toResponseDto(override: FeatureOverride): OverrideResponseDto {
    return {
      id: override.id,
      tenantId: override.tenantId,
      featureKey: override.featureKey,
      value: override.value,
      grantedBy: override.grantedBy,
      grantedAt: override.grantedAt,
      reason: override.reason,
      expiresAt: override.expiresAt,
      createdAt: override.createdAt,
      updatedAt: override.updatedAt,
    };
  }
}

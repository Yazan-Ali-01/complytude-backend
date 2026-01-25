import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
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
import { SwaggerCookieAuth } from '../../common/swagger/common';
import { SystemAdminGuard } from '@complytude/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OverridesService } from './overrides.service';
import { FeatureOverride } from './entities/feature-override.entity';
import {
  CreateOverrideDto,
  BulkCreateOverrideDto,
  OverrideResponseDto,
  OverrideListResponseDto,
  RevokeOverrideResponseDto,
} from './dto/override.dto';

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
    type: OverrideResponseDto,
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
    description: 'Creates multiple feature overrides in a single transaction.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 201,
    description: 'Overrides granted successfully',
    type: OverrideListResponseDto,
  })
  async grantBulkOverrides(
    @Param('tenantId') tenantId: string,
    @Body() dto: BulkCreateOverrideDto,
    @CurrentUser() user: { id: string },
  ): Promise<OverrideListResponseDto> {
    this.logger.log(
      `[ADMIN] Granting ${dto.overrides.length} bulk overrides for tenant ${tenantId}`,
    );

    const overrides = await this.overridesService.grantBulkOverrides(
      tenantId,
      dto.overrides.map((o) => ({
        featureKey: o.featureKey,
        value: o.value,
        reason: dto.reason || o.reason,
        expiresAt: o.expiresAt ? new Date(o.expiresAt) : undefined,
      })),
      user.id,
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
      'Retrieves all feature overrides for a tenant. Use includeExpired/includeRevoked to see historical overrides.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiQuery({
    name: 'includeExpired',
    required: false,
    type: Boolean,
    description: 'Include expired overrides (default: false)',
  })
  @ApiQuery({
    name: 'includeRevoked',
    required: false,
    type: Boolean,
    description: 'Include revoked overrides (default: false)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of overrides',
    type: OverrideListResponseDto,
  })
  async getOverrides(
    @Param('tenantId') tenantId: string,
    @Query('includeExpired') includeExpired?: string,
    @Query('includeRevoked') includeRevoked?: string,
  ): Promise<OverrideListResponseDto> {
    this.logger.log(`[ADMIN] Fetching overrides for tenant ${tenantId}`);

    const overrides = await this.overridesService.getTenantOverrides(
      tenantId,
      includeExpired === 'true',
      includeRevoked === 'true',
    );

    return {
      overrides: overrides.map((o) => this.toResponseDto(o)),
      total: overrides.length,
    };
  }

  @Get(':featureKey')
  @ApiOperation({
    summary: '[ADMIN] Get specific override',
    description: 'Retrieves a specific active feature override for a tenant.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({ name: 'featureKey', description: 'Feature key' })
  @ApiResponse({
    status: 200,
    description: 'Override details',
    type: OverrideResponseDto,
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

  @Patch(':featureKey/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Revoke feature override',
    description:
      'Soft-revokes a feature override (preserved for audit trail). The tenant reverts to plan defaults.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({ name: 'featureKey', description: 'Feature key to revoke' })
  @ApiResponse({
    status: 200,
    description: 'Override revoked successfully',
    type: RevokeOverrideResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Override not found' })
  async revokeOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @CurrentUser() user: { id: string },
  ): Promise<RevokeOverrideResponseDto> {
    this.logger.log(
      `[ADMIN] Revoking override for tenant ${tenantId}, feature: ${featureKey}`,
    );

    await this.overridesService.revokeOverride(tenantId, featureKey, user.id);

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
      revokedAt: override.revokedAt,
      revokedBy: override.revokedBy,
      createdAt: override.createdAt,
      updatedAt: override.updatedAt,
    };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import { PlatformPermissionsGuard } from 'src/common/guards/platform-permissions.guard';
import { DatabaseService } from '../../../database/database.service';
import { TenantOverridesRepository } from '../../../repositories/entitlements/tenant-overrides.repository';
import { FeaturesRepository } from '../../../repositories/features/features.repository';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserIdentity } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedIdentityUser } from '../../auth/strategies/jwt-payload.interface';
import {
  ApplyOverrideDto,
  OverrideResponseDto,
  UpdateOverrideDto,
} from '../dto/tenant-override.dto';
import { TenantOverridesService } from '../services/tenant-overrides.service';

/**
 * Tenant Overrides Controller
 *
 * Platform admin endpoints for managing entitlement overrides.
 * Requires platform authentication and entitlements:manage permission.
 */
@Controller('admin/tenants/:tenantId/overrides')
@ApiTags('admin-overrides')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('entitlements:manage')
export class TenantOverridesController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantOverridesService: TenantOverridesService,
    private readonly tenantOverridesRepository: TenantOverridesRepository,
    private readonly featuresRepository: FeaturesRepository,
  ) {}

  /**
   * List all overrides for a tenant
   */
  @Get()
  @ApiOperation({ summary: '[ADMIN] List tenant entitlement overrides' })
  @ApiParam({
    name: 'tenantId',
    description: 'Target tenant ID',
  })
  @ApiResponse({
    status: 200,
    description: "Tenant's active overrides",
    type: [OverrideResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires entitlements:manage',
  })
  async listOverrides(
    @Param('tenantId') tenantId: string,
  ): Promise<OverrideResponseDto[]> {
    const overrides =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.tenantOverridesRepository.findActiveByTenant(tenantId, {
            client,
          }),
      );

    return overrides.map((override) => ({
      id: override.id,
      featureKey: override.feature_key,
      featureType: override.feature_type,
      valueBool: override.value_bool,
      valueInt: override.value_int,
      valueText: override.value_text,
      reason: override.reason,
      appliedBy: override.applied_by,
      startsAt: override.starts_at,
      expiresAt: override.expires_at,
      isActive: override.is_active,
      createdAt: override.created_at,
      updatedAt: override.updated_at,
    }));
  }

  /**
   * Apply an override for a tenant
   */
  @Post()
  @ApiOperation({ summary: '[ADMIN] Apply entitlement override' })
  @ApiParam({
    name: 'tenantId',
    description: 'Target tenant ID',
  })
  @ApiResponse({
    status: 201,
    description: 'Override applied successfully',
    type: OverrideResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error - exactly one value field required',
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires entitlements:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'Feature not found',
  })
  async applyOverride(
    @Param('tenantId') tenantId: string,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
    @Body() dto: ApplyOverrideDto,
  ): Promise<OverrideResponseDto> {
    // Validate exactly one value field is set
    this.validateValueFields(dto);

    // Look up feature by key (public catalog lookup)
    const feature = await this.featuresRepository.findByKey(dto.featureKey);

    if (!feature) {
      throw new NotFoundException(`Feature not found: ${dto.featureKey}`);
    }

    // Apply override with platform context
    const override = await this.tenantOverridesService.applyOverride(
      {
        tenant_id: tenantId,
        feature_id: feature.id,
        value_bool: dto.valueBool,
        value_int: dto.valueInt,
        value_text: dto.valueText,
        reason: dto.reason,
        applied_by: identity.userId,
        expires_at: dto.expiresAt,
      },
      { mode: 'platform' },
    );

    return {
      id: override.id,
      featureKey: feature.key,
      featureType: feature.feature_type,
      valueBool: override.value_bool,
      valueInt: override.value_int,
      valueText: override.value_text,
      reason: override.reason,
      appliedBy: override.applied_by,
      startsAt: override.starts_at,
      expiresAt: override.expires_at,
      isActive: override.is_active,
      createdAt: override.created_at,
      updatedAt: override.updated_at,
    };
  }

  /**
   * Update an override
   */
  @Patch(':id')
  @ApiOperation({ summary: '[ADMIN] Update entitlement override' })
  @ApiParam({
    name: 'tenantId',
    description: 'Target tenant ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Override ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Override updated successfully',
    type: OverrideResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires entitlements:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'Override not found',
  })
  async updateOverride(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOverrideDto,
  ): Promise<OverrideResponseDto> {
    // Validate at most one value field is set (zero is OK when updating reason/expiry only)
    this.validateValueFieldsForUpdate(dto);

    const valueFields = this.buildValueFieldsForUpdate(dto);

    const updated = await this.tenantOverridesService.updateOverride(
      tenantId,
      id,
      {
        ...valueFields,
        reason: dto.reason,
        expires_at: dto.expiresAt,
      },
      { mode: 'platform' },
    );

    return {
      id: updated.id,
      featureKey: updated.feature_key,
      featureType: updated.feature_type,
      valueBool: updated.value_bool,
      valueInt: updated.value_int,
      valueText: updated.value_text,
      reason: updated.reason,
      appliedBy: updated.applied_by,
      startsAt: updated.starts_at,
      expiresAt: updated.expires_at,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  /**
   * Revoke (deactivate) an override
   */
  @Delete(':id')
  @ApiOperation({ summary: '[ADMIN] Revoke entitlement override' })
  @ApiParam({
    name: 'tenantId',
    description: 'Target tenant ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Override ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Override revoked successfully',
    type: OverrideResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires entitlements:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'Override not found',
  })
  async revokeOverride(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ): Promise<OverrideResponseDto> {
    const revoked = await this.tenantOverridesService.revokeOverride(
      tenantId,
      id,
      { mode: 'platform' },
    );

    return {
      id: revoked.id,
      featureKey: revoked.feature_key,
      featureType: revoked.feature_type,
      valueBool: revoked.value_bool,
      valueInt: revoked.value_int,
      valueText: revoked.value_text,
      reason: revoked.reason,
      appliedBy: revoked.applied_by,
      startsAt: revoked.starts_at,
      expiresAt: revoked.expires_at,
      isActive: revoked.is_active,
      createdAt: revoked.created_at,
      updatedAt: revoked.updated_at,
    };
  }

  /**
   * Validate that exactly one value field is set (for create)
   */
  private validateValueFields(dto: ApplyOverrideDto): void {
    const fieldsSet = [
      dto.valueBool !== undefined,
      dto.valueInt !== undefined,
      dto.valueText !== undefined,
    ].filter(Boolean).length;

    if (fieldsSet !== 1) {
      throw new BadRequestException(
        'Exactly one of valueBool, valueInt, or valueText must be provided',
      );
    }
  }

  /**
   * Validate that at most one value field is set (for update)
   */
  private validateValueFieldsForUpdate(dto: UpdateOverrideDto): void {
    const fieldsSet = [
      dto.valueBool !== undefined,
      dto.valueInt !== undefined,
      dto.valueText !== undefined,
    ].filter(Boolean).length;

    if (fieldsSet > 1) {
      throw new BadRequestException(
        'At most one of valueBool, valueInt, or valueText can be provided',
      );
    }
  }

  /**
   * Build value fields for update, ensuring DB constraint compliance.
   *
   * The DB constraint `chk_tenant_overrides_value` requires exactly one
   * value field to be NOT NULL. When updating a value field, we must
   * explicitly null the others to satisfy this constraint.
   *
   * When no value fields are being updated (only reason/expiresAt),
   * all value fields remain undefined to preserve existing values.
   */
  private buildValueFieldsForUpdate(dto: UpdateOverrideDto): {
    value_bool: boolean | null | undefined;
    value_int: number | null | undefined;
    value_text: string | null | undefined;
  } {
    const hasValueUpdate =
      dto.valueBool !== undefined ||
      dto.valueInt !== undefined ||
      dto.valueText !== undefined;

    if (!hasValueUpdate) {
      // Not updating any value fields - preserve existing values
      return {
        value_bool: undefined,
        value_int: undefined,
        value_text: undefined,
      };
    }

    // Updating at least one value field - explicitly null the others
    return {
      value_bool: dto.valueBool !== undefined ? dto.valueBool : null,
      value_int: dto.valueInt !== undefined ? dto.valueInt : null,
      value_text: dto.valueText !== undefined ? dto.valueText : null,
    };
  }
}

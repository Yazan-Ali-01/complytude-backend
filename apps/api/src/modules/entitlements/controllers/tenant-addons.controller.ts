import {
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
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { MessageResponseDto } from '../../../common/dto';
import { DatabaseService } from '../../../database/database.service';
import { AddonsRepository } from '../../../repositories/entitlements/addons.repository';
import { TenantAddonsRepository } from '../../../repositories/entitlements/tenant-addons.repository';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../../auth/strategies/jwt-payload.interface';
import {
  AddAddonDto,
  TenantAddonEntitlementDto,
  TenantAddonResponseDto,
  UpdateAddonDto,
} from '../dto/tenant-addon.dto';
import { TenantAddonsService } from '../services/tenant-addons.service';

/**
 * Tenant Add-ons Controller
 *
 * Endpoints for tenants to manage their add-on subscriptions.
 * Requires tenant authentication and billing:manage permission for mutations.
 */
@Controller('tenants/addons')
@ApiTags('tenant-addons')
@AuthOptions({ tenant: true })
export class TenantAddonsController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantAddonsService: TenantAddonsService,
    private readonly tenantAddonsRepository: TenantAddonsRepository,
    private readonly addonsRepository: AddonsRepository,
  ) {}

  /**
   * List tenant's active add-ons
   */
  @Get()
  @ApiOperation({ summary: "List tenant's active add-ons" })
  @ApiResponse({
    status: 200,
    description: "Tenant's active add-ons with entitlements",
    type: [TenantAddonResponseDto],
  })
  async listTenantAddons(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantAddonResponseDto[]> {
    const addons = await this.databaseService.transactionWithTenantContext(
      { tenantId: user.tenantId, isTenantAdmin: true },
      async (client) =>
        this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
          user.tenantId,
          { client },
        ),
    );
    return addons.map((addon) => {
      // Map entitlements to DTO
      const entitlements: TenantAddonEntitlementDto[] = addon.entitlements.map(
        (ent) => ({
          featureKey: ent.feature_key,
          featureType: ent.feature_type,
          valueBool: ent.value_bool,
          valueInt: ent.value_int,
          valueText: ent.value_text,
        }),
      );

      return {
        id: addon.id,
        addonKey: addon.addon_id,
        addonName: 'Add-on', // TODO: JOIN with addons table to get name
        quantity: addon.quantity,
        status: addon.status,
        startsAt: addon.starts_at,
        expiresAt: addon.expires_at,
        entitlements,
        createdAt: addon.created_at,
        updatedAt: addon.updated_at,
      };
    });
  }

  /**
   * Add an add-on to tenant
   */
  @Post()
  @UseGuards(TenantPermissionsGuard) // TODO: change to platform permissions guard ( in the future this will be replaced with a new rls specific approach for this use case )
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({ summary: '[PLATFORM] Add an add-on to tenant subscription' })
  async addAddon(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: AddAddonDto,
  ): Promise<TenantAddonResponseDto> {
    // Look up addon by key (public catalog lookup)
    const addon = await this.addonsRepository.findByKey(dto.addonKey);

    if (!addon) {
      throw new NotFoundException(`Add-on not found: ${dto.addonKey}`);
    }

    // Create tenant addon with tenant context and permission check
    const tenantAddon = await this.tenantAddonsService.addAddon(
      {
        tenant_id: user.tenantId,
        addon_id: addon.id,
        quantity: dto.quantity ?? 1,
      },
      { mode: 'platform' },
    );

    // Fetch full details with entitlements
    const addonsWithEntitlements =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
            user.tenantId,
            { client },
          ),
      );

    const createdAddon = addonsWithEntitlements.find(
      (a) => a.id === tenantAddon.id,
    );

    if (!createdAddon) {
      // Fallback if not found in the list
      return {
        id: tenantAddon.id,
        addonKey: addon.key,
        addonName: addon.name,
        quantity: tenantAddon.quantity,
        status: tenantAddon.status,
        startsAt: tenantAddon.starts_at,
        expiresAt: tenantAddon.expires_at,
        entitlements: [],
        createdAt: tenantAddon.created_at,
        updatedAt: tenantAddon.updated_at,
      };
    }

    // Map entitlements to DTO
    const entitlements: TenantAddonEntitlementDto[] =
      createdAddon.entitlements.map((ent) => ({
        featureKey: ent.feature_key,
        featureType: ent.feature_type,
        valueBool: ent.value_bool,
        valueInt: ent.value_int,
        valueText: ent.value_text,
      }));

    return {
      id: createdAddon.id,
      addonKey: addon.key,
      addonName: addon.name,
      quantity: createdAddon.quantity,
      status: createdAddon.status,
      startsAt: createdAddon.starts_at,
      expiresAt: createdAddon.expires_at,
      entitlements,
      createdAt: createdAddon.created_at,
      updatedAt: createdAddon.updated_at,
    };
  }

  /**
   * Update tenant add-on (quantity or status)
   */
  @Patch(':id')
  @UseGuards(TenantPermissionsGuard) // TODO: change to platform permissions guard ( in the future this will be replaced with a new rls specific approach for this use case )
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({ summary: 'Update tenant add-on quantity or status' })
  @ApiParam({
    name: 'id',
    description: 'Tenant add-on ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Add-on updated successfully',
    type: TenantAddonResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires billing:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'Add-on not found',
  })
  async updateAddon(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddonDto,
  ): Promise<TenantAddonResponseDto> {
    const updated = await this.tenantAddonsService.updateAddon(
      user.tenantId,
      id,
      {
        ...dto,
      },
      { mode: 'platform' },
    );

    // Fetch with entitlements
    const addonsWithEntitlements =
      await this.databaseService.transactionWithPlatformAdminContext(
        async (client) =>
          this.tenantAddonsRepository.findActiveByTenantWithEntitlements(
            user.tenantId,
            { client },
          ),
      );

    const updatedAddon = addonsWithEntitlements.find(
      (a) => a.id === updated.id,
    );

    if (!updatedAddon) {
      // Fallback
      return {
        id: updated.id,
        addonKey: updated.addon_id,
        addonName: 'Add-on',
        quantity: updated.quantity,
        status: updated.status,
        startsAt: updated.starts_at,
        expiresAt: updated.expires_at,
        entitlements: [],
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    }

    // Map entitlements to DTO
    const entitlements: TenantAddonEntitlementDto[] =
      updatedAddon.entitlements.map((ent) => ({
        featureKey: ent.feature_key,
        featureType: ent.feature_type,
        valueBool: ent.value_bool,
        valueInt: ent.value_int,
        valueText: ent.value_text,
      }));

    return {
      id: updatedAddon.id,
      addonKey: updatedAddon.addon_id,
      addonName: 'Add-on', // TODO: JOIN with addons table
      quantity: updatedAddon.quantity,
      status: updatedAddon.status,
      startsAt: updatedAddon.starts_at,
      expiresAt: updatedAddon.expires_at,
      entitlements,
      createdAt: updatedAddon.created_at,
      updatedAt: updatedAddon.updated_at,
    };
  }

  /**
   * Remove (cancel) tenant add-on
   */
  @Delete(':id')
  @UseGuards(TenantPermissionsGuard) // TODO: change to platform permissions guard ( in the future this will be replaced with a new rls specific approach for this use case )
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({ summary: '[TENANT] Remove (cancel) tenant add-on' })
  @ApiParam({
    name: 'id',
    description: 'Tenant add-on ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Add-on removed successfully',
    type: TenantAddonResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires billing:manage',
  })
  @ApiResponse({
    status: 404,
    description: 'Add-on not found',
  })
  async removeAddon(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('id') id: string,
  ): Promise<MessageResponseDto> {
    await this.tenantAddonsService.removeAddon(user.tenantId, id, {
      mode: 'platform',
    });

    return new MessageResponseDto('Add-on removed successfully');
  }
}

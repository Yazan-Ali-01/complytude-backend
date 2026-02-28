import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import { PlatformPermissionsGuard } from 'src/common/guards/platform-permissions.guard';
import { I18nKeys } from '../../../common/constants';
import { MessageResponseDto } from '../../../common/dto';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { AddAddonDto, TenantAddonResponseDto } from '../dto/tenant-addon.dto';
import { TenantAddonsService } from '../services/tenant-addons.service';
import { mapTenantAddonToDto } from '../utils/entitlement-mappers.util';

/**
 * Platform Addons Controller
 *
 * Platform admin endpoints for managing tenant add-ons.
 * Mirrors TenantOverridesController architecture for symmetry.
 * Use cases: support scenarios, partnerships, gifted addons.
 */
@Controller('admin/tenants/:tenantId/addons')
@ApiTags('admin-addons')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@RequireAnyPlatformPermission('entitlements:manage')
export class PlatformAddonsController {
  constructor(
    private readonly tenantAddonsService: TenantAddonsService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * List tenant's active add-ons (platform admin view)
   */
  @Get()
  @ApiOperation({ summary: '[ADMIN] List tenant add-ons' })
  @ApiParam({ name: 'tenantId', description: 'Target tenant ID' })
  @ApiResponse({
    status: 200,
    description: "Tenant's active add-ons",
    type: [TenantAddonResponseDto],
  })
  async listTenantAddons(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantAddonResponseDto[]> {
    const addons = await this.tenantAddonsService.listAddons(tenantId, {
      context: { mode: 'platform' },
    });

    return addons.map((addon) => mapTenantAddonToDto(addon, addon.addon_name));
  }

  /**
   * Add an add-on to a tenant (platform admin operation)
   * Use cases: support, partnerships, gifted addons
   */
  @Post()
  @ApiOperation({ summary: '[ADMIN] Add add-on to tenant' })
  @ApiParam({ name: 'tenantId', description: 'Target tenant ID' })
  @ApiResponse({
    status: 201,
    description: 'Add-on activated successfully',
    type: TenantAddonResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Add-on not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Add-on already active for tenant',
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires entitlements:manage',
  })
  async addAddonToTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: AddAddonDto,
  ): Promise<TenantAddonResponseDto> {
    const created = await this.tenantAddonsService.addAddon(
      tenantId,
      dto.addonKey,
      dto.quantity ?? 1,
      { context: { mode: 'platform' } },
    );

    return mapTenantAddonToDto(created, created.addon_name);
  }

  /**
   * Remove an add-on from a tenant (platform admin operation)
   */
  @Delete(':id')
  @ApiOperation({ summary: '[ADMIN] Remove add-on from tenant' })
  @ApiParam({ name: 'tenantId', description: 'Target tenant ID' })
  @ApiParam({ name: 'id', description: 'Tenant add-on ID' })
  @ApiResponse({
    status: 200,
    description: 'Add-on removed successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Add-on not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied - requires entitlements:manage',
  })
  async removeAddonFromTenant(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ): Promise<MessageResponseDto> {
    await this.tenantAddonsService.removeAddon(tenantId, id, {
      context: { mode: 'platform' },
    });

    return new MessageResponseDto(this.i18n.t(I18nKeys.ADDON_REMOVE_SUCCESS));
  }
}

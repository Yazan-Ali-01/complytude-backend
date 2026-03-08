import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { I18nKeys } from '../../../common/constants/i18n-keys';
import { MessageResponseDto } from '../../../common/dto';
import { AuthOptions } from '../../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../../auth/decorators/current-user.decorator';
import { StripeAddonService } from '../../stripe/services/stripe-addon.service';
import type { AuthenticatedTenantUser } from '../../auth/strategies/jwt-payload.interface';
import {
  AddAddonDto,
  TenantAddonResponseDto,
  UpdateAddonDto,
} from '../dto/tenant-addon.dto';
import { TenantAddonsService } from '../services/tenant-addons.service';
import { mapTenantAddonToDto } from '../utils/entitlement-mappers.util';

@Controller('tenants/addons')
@ApiTags('tenant-addons')
@AuthOptions({ tenant: true })
@UseGuards(TenantPermissionsGuard)
export class TenantAddonsController {
  constructor(
    private readonly tenantAddonsService: TenantAddonsService,
    private readonly stripeAddonService: StripeAddonService,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({ summary: "List tenant's active add-ons" })
  @ApiResponse({
    status: 200,
    description: "Tenant's active add-ons with entitlements",
    type: [TenantAddonResponseDto],
  })
  async listTenantAddons(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantAddonResponseDto[]> {
    const addons = await this.tenantAddonsService.listAddons(user.tenantId, {
      context: { mode: 'tenant', canManageSettings: true },
    });

    return addons.map((addon) => mapTenantAddonToDto(addon, addon.addon_name));
  }

  @Post()
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({ summary: 'Add an add-on to tenant subscription' })
  @ApiResponse({
    status: 201,
    description: 'Add-on activated and Stripe subscription item created',
    type: TenantAddonResponseDto,
  })
  async addAddon(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Body() dto: AddAddonDto,
  ): Promise<TenantAddonResponseDto> {
    const created = await this.stripeAddonService.addAddon(
      user.tenantId,
      dto.addonKey,
      dto.quantity ?? 1,
    );

    return mapTenantAddonToDto(created, created.addon_name);
  }

  @Patch(':id')
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({ summary: 'Update tenant add-on quantity' })
  @ApiParam({ name: 'id', description: 'Tenant add-on ID' })
  @ApiResponse({
    status: 200,
    description: 'Add-on quantity updated in Stripe',
    type: TenantAddonResponseDto,
  })
  async updateAddon(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddonDto,
  ): Promise<TenantAddonResponseDto> {
    if (dto.quantity === undefined) {
      throw new BadRequestException(
        'quantity is required to update a Stripe add-on',
      );
    }

    const updated = await this.stripeAddonService.updateAddonQuantity(
      user.tenantId,
      id,
      dto.quantity,
    );

    return mapTenantAddonToDto(updated, updated.addon_name);
  }

  @Delete(':id')
  @RequireAnyTenantPermission('billing:manage')
  @ApiOperation({ summary: 'Remove (cancel) tenant add-on' })
  @ApiParam({ name: 'id', description: 'Tenant add-on ID' })
  @ApiResponse({
    status: 200,
    description: 'Add-on removed from Stripe subscription',
    type: MessageResponseDto,
  })
  async removeAddon(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageResponseDto> {
    await this.stripeAddonService.removeAddon(user.tenantId, id);

    return new MessageResponseDto(this.i18n.t(I18nKeys.ADDON_REMOVE_SUCCESS));
  }
}

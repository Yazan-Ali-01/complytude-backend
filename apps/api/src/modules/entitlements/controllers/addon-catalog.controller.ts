import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { Public } from '../../auth/decorators/auth-options.decorator';
import { EntitlementsI18n } from '../constants/i18n.constants';
import {
  AddonCatalogDetailResponseDto,
  AddonCatalogResponseDto,
} from '../dto/addon-catalog.dto';
import { TenantAddonsService } from '../services/tenant-addons.service';
import {
  mapAddonToCatalogDetailDto,
  mapAddonToCatalogDto,
} from '../utils/entitlement-mappers.util';

/**
 * Add-on Catalog Controller
 *
 * Public endpoints for browsing available add-ons.
 * No authentication required - this is a public catalog.
 */
@Controller('addons')
@ApiTags('addons')
@Public()
export class AddonCatalogController {
  constructor(
    private readonly tenantAddonsService: TenantAddonsService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * List all available add-ons
   */
  @Get()
  @ApiOperation({ summary: 'List all available add-ons' })
  @ApiResponse({
    status: 200,
    description: 'List of available add-ons',
    type: [AddonCatalogResponseDto],
  })
  async listAddons(): Promise<AddonCatalogResponseDto[]> {
    const addons = await this.tenantAddonsService.listCatalog();
    return addons.map(mapAddonToCatalogDto);
  }

  /**
   * Get add-on details with entitlements
   */
  @Get(':key')
  @ApiOperation({ summary: 'Get add-on details by key' })
  @ApiParam({
    name: 'key',
    description: 'Add-on unique key',
    example: 'extra_documents_pack',
  })
  @ApiResponse({
    status: 200,
    description: 'Add-on details with entitlements',
    type: AddonCatalogDetailResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Add-on not found',
  })
  async getAddonByKey(
    @Param('key') key: string,
  ): Promise<AddonCatalogDetailResponseDto> {
    const addon = await this.tenantAddonsService.getCatalogByKey(key);

    if (!addon) {
      throw new NotFoundException(
        this.i18n.t(EntitlementsI18n.errors.ADDON_NOT_FOUND),
      );
    }
    return mapAddonToCatalogDetailDto(addon);
  }
}

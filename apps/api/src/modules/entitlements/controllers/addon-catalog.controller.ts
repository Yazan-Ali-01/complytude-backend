import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AddonsRepository } from '../../../repositories/entitlements/addons.repository';
import {
  AddonCatalogDetailResponseDto,
  AddonCatalogResponseDto,
  AddonEntitlementDto,
} from '../dto/addon-catalog.dto';

/**
 * Add-on Catalog Controller
 *
 * Public endpoints for browsing available add-ons.
 * No authentication required - this is a public catalog.
 */
@Controller('addons')
@ApiTags('addons')
export class AddonCatalogController {
  constructor(private readonly addonsRepository: AddonsRepository) {}

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
    // Public endpoint - no context needed, uses default connection
    const addons = await this.addonsRepository.findAllActive();

    return addons.map((addon) => ({
      id: addon.id,
      key: addon.key,
      name: addon.name,
      description: addon.description,
      priceMonthly: addon.price_monthly,
      priceCurrency: addon.price_currency,
      isActive: addon.is_active,
    }));
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
    // Public endpoint - no context needed, uses default connection
    const addon = await this.addonsRepository.findByKeyWithEntitlements(key);

    if (!addon) {
      throw new NotFoundException(`Add-on not found: ${key}`);
    }

    // Map entitlements to DTO
    const entitlements: AddonEntitlementDto[] = addon.entitlements.map(
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
      key: addon.key,
      name: addon.name,
      description: addon.description,
      priceMonthly: addon.price_monthly,
      priceCurrency: addon.price_currency,
      isActive: addon.is_active,
      entitlements,
    };
  }
}

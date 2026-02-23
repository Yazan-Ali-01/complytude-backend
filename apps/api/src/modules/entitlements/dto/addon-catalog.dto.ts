import { ApiProperty } from '@nestjs/swagger';
import type {
  FeatureKey,
  FeatureType,
} from 'src/common/types/entitlement.types';

/**
 * Add-on catalog response DTO (list view)
 */
export class AddonCatalogResponseDto {
  @ApiProperty({
    description: 'Add-on ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Add-on unique key',
    example: 'extra_documents_pack',
  })
  key: string;

  @ApiProperty({
    description: 'Add-on name',
    example: 'Extra Documents Pack',
  })
  name: string;

  @ApiProperty({
    description: 'Add-on description',
    example: 'Add 100 additional documents per month to your plan',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Monthly price',
    example: 99.0,
  })
  priceMonthly: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'AED',
  })
  priceCurrency: string;

  @ApiProperty({
    description: 'Whether this add-on is currently available',
    example: true,
  })
  isActive: boolean;
}

/**
 * Add-on entitlement DTO (for detail view)
 */
export class AddonEntitlementDto {
  @ApiProperty({
    description: 'Feature key',
    example: 'documents_per_month',
  })
  featureKey: FeatureKey;

  @ApiProperty({
    description: 'Feature type',
    enum: ['boolean', 'quota', 'metered', 'capacity', 'rate_limit'],
    example: 'quota',
  })
  featureType: FeatureType;

  @ApiProperty({
    description: 'Boolean value (for boolean features)',
    example: true,
    required: false,
  })
  valueBool?: boolean;

  @ApiProperty({
    description: 'Integer value (for quota/capacity features)',
    example: 100,
    required: false,
  })
  valueInt?: number;

  @ApiProperty({
    description: 'Text value (for tiered features)',
    example: 'premium',
    required: false,
  })
  valueText?: string;
}

/**
 * Add-on catalog detail response DTO (detail view with entitlements)
 */
export class AddonCatalogDetailResponseDto extends AddonCatalogResponseDto {
  @ApiProperty({
    description: 'Feature entitlements provided by this add-on',
    type: [AddonEntitlementDto],
  })
  entitlements: AddonEntitlementDto[];
}

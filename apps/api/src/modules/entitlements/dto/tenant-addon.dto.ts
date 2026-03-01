import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type {
  FeatureKey,
  FeatureType,
} from 'src/common/types/entitlement.types';

/**
 * DTO for adding an add-on to a tenant
 */
export class AddAddonDto {
  @ApiProperty({
    description: 'Add-on key to activate',
    example: 'extra_documents_pack',
  })
  @IsString()
  @IsNotEmpty()
  addonKey: string;

  @ApiProperty({
    description: 'Quantity (number of instances, defaults to 1)',
    example: 1,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

/**
 * DTO for updating a tenant add-on
 */
export class UpdateAddonDto {
  @ApiProperty({
    description: 'New quantity',
    example: 2,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({
    description: 'Status (active or paused)',
    example: 'active',
    enum: ['active', 'paused'],
    required: false,
  })
  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: string;
}

/**
 * Add-on entitlement DTO (for tenant response)
 */
export class TenantAddonEntitlementDto {
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
 * Tenant add-on response DTO
 */
export class TenantAddonResponseDto {
  @ApiProperty({
    description: 'Tenant add-on ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Add-on key',
    example: 'extra_documents_pack',
  })
  addonKey: string;

  @ApiProperty({
    description: 'Add-on name',
    example: 'Extra Documents Pack',
  })
  addonName: string;

  @ApiProperty({
    description: 'Quantity purchased',
    example: 1,
  })
  quantity: number;

  @ApiProperty({
    description: 'Current status',
    example: 'active',
  })
  status: string;

  @ApiProperty({
    description: 'Start date',
    example: '2024-01-15T10:00:00Z',
  })
  startsAt: Date;

  @ApiProperty({
    description: 'Expiration date (if applicable)',
    example: '2024-12-31T23:59:59Z',
    required: false,
  })
  expiresAt?: Date;

  @ApiProperty({
    description: 'Feature entitlements provided by this add-on',
    type: [TenantAddonEntitlementDto],
  })
  entitlements: TenantAddonEntitlementDto[];

  // here we could add an entitlement property like this ( I mentioned it because its not mentioned in the ticket, for now we use the TenantAddonEntitlementDto dto temporarily )
  // @ApiProperty({
  //   description: 'Effective entitlements (feature key -> entitlement)',
  //   type: 'object',
  //   additionalProperties: { type: 'object' },
  // })
  // entitlements: Record<string, EffectiveEntitlementDto>;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-15T10:00:00Z',
  })
  updatedAt: Date;
}

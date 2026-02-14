import { ApiProperty } from '@nestjs/swagger';
import type {
  FeatureType,
  PlanKey,
  UsageSource,
} from 'src/common/types/entitlement.types';

/**
 * Effective entitlement response DTO
 */
export class EffectiveEntitlementDto {
  @ApiProperty({
    description: 'Feature key',
    example: 'documents_per_month',
  })
  featureKey: string;

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
    description: 'Integer value (for quota/capacity features, -1 = unlimited)',
    example: 100,
    required: false,
  })
  valueInt?: number;

  @ApiProperty({
    description: 'Text value (for tiered features)',
    example: 'full',
    required: false,
  })
  valueText?: string;

  @ApiProperty({
    description: 'Source of entitlement',
    enum: ['plan', 'addon', 'credit', 'override'],
    example: 'plan',
  })
  source: UsageSource;
}

/**
 * Current tenant entitlements response DTO
 */
export class CurrentEntitlementsResponseDto {
  @ApiProperty({
    description: 'Tenant ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Current plan key',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    example: 'general_counsel',
  })
  plan: PlanKey;

  @ApiProperty({
    description: 'Effective entitlements (feature key -> entitlement)',
    type: 'object',
    additionalProperties: { type: 'object' },
  })
  entitlements: Record<string, EffectiveEntitlementDto>;
}

/**
 * Plan response DTO
 */
export class PlanResponseDto {
  @ApiProperty({
    description: 'Plan ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Plan key',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    example: 'shield',
  })
  key: PlanKey;

  @ApiProperty({
    description: 'Plan name',
    example: 'Shield',
  })
  name: string;

  @ApiProperty({
    description: 'Plan description',
    example: 'Solo entrepreneurs — Essential templates + basic analysis',
  })
  description: string;

  @ApiProperty({
    description: 'Monthly price',
    example: 249.0,
  })
  priceMonthly: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'AED',
  })
  priceCurrency: string;

  @ApiProperty({
    description: 'Billing period',
    example: 'monthly',
  })
  billingPeriod: string;

  @ApiProperty({
    description: 'Plan entitlements',
    type: 'object',
    additionalProperties: { type: 'object' },
  })
  entitlements: Record<string, EffectiveEntitlementDto>;
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import type {
  FeatureKey,
  FeatureType,
} from 'src/common/types/entitlement.types';

/**
 * DTO for applying an entitlement override
 *
 * Custom validation: Exactly one of valueBool/valueInt/valueText must be set.
 * This matches the DB constraint chk_tenant_overrides_value.
 */
export class ApplyOverrideDto {
  @ApiProperty({
    description: 'Feature key to override',
    example: 'documents_per_month',
  })
  @IsString()
  @IsNotEmpty()
  featureKey: FeatureKey;

  @ApiProperty({
    description: 'Boolean value (for boolean features)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  valueBool?: boolean;

  @ApiProperty({
    description: 'Integer value (for quota/capacity features)',
    example: 500,
    required: false,
  })
  @IsOptional()
  @IsInt()
  valueInt?: number;

  @ApiProperty({
    description: 'Text value (for tiered features)',
    example: 'premium',
    required: false,
  })
  @IsOptional()
  @IsString()
  valueText?: string;

  @ApiProperty({
    description: 'Reason for applying this override',
    example: 'Special customer agreement - Q1 2024 promotion',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({
    description: 'Expiration date (ISO 8601 format)',
    example: '2024-12-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;
}

/**
 * DTO for updating an override
 */
export class UpdateOverrideDto {
  @ApiProperty({
    description: 'New boolean value',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  valueBool?: boolean;

  @ApiProperty({
    description: 'New integer value',
    example: 1000,
    required: false,
  })
  @IsOptional()
  @IsInt()
  valueInt?: number;

  @ApiProperty({
    description: 'New text value',
    example: 'enterprise',
    required: false,
  })
  @IsOptional()
  @IsString()
  valueText?: string;

  @ApiProperty({
    description: 'Updated reason',
    example: 'Extended per customer request',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    description: 'New expiration date (ISO 8601 format)',
    example: '2025-06-30T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;
}

/**
 * Override response DTO
 */
export class OverrideResponseDto {
  @ApiProperty({
    description: 'Override ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

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
    example: 500,
    required: false,
  })
  valueInt?: number;

  @ApiProperty({
    description: 'Text value (for tiered features)',
    example: 'premium',
    required: false,
  })
  valueText?: string;

  @ApiProperty({
    description: 'Reason for this override',
    example: 'Special customer agreement - Q1 2024 promotion',
  })
  reason: string;

  @ApiProperty({
    description: 'Admin user who applied the override',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  appliedBy: string;

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
    description: 'Whether this override is currently active',
    example: true,
  })
  isActive: boolean;

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

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  ALL_FEATURE_KEYS,
  FEATURE_CATALOG,
} from 'src/common/constants/plan-entitlements.constant';
import type {
  FeatureKey,
  FeatureType,
} from 'src/common/types/entitlement.types';

// =============================================================================
// Custom validator: checks that `value` matches the storage_type of `featureKey`
// When featureKey is absent (UpdateOverrideDto), just checks it's a primitive.
// =============================================================================

@ValidatorConstraint({ name: 'matchesFeatureValueType', async: false })
class MatchesFeatureValueTypeConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, args: ValidationArguments): boolean {
    const featureKey = (args.object as Record<string, unknown>).featureKey;

    if (featureKey === undefined) {
      // UpdateOverrideDto: featureKey not present, just ensure it's a primitive
      return (
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isInteger(value)) ||
        typeof value === 'string'
      );
    }

    const feature = FEATURE_CATALOG[featureKey as FeatureKey];
    if (!feature) {
      return false; // featureKey is invalid; @IsIn will catch this separately
    }

    switch (feature.storage_type) {
      case 'bool':
        return typeof value === 'boolean';
      case 'int':
        return typeof value === 'number' && Number.isInteger(value);
      case 'text':
        return typeof value === 'string';
      default:
        return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const featureKey = (args.object as Record<string, unknown>).featureKey as
      | FeatureKey
      | undefined;
    const feature = featureKey ? FEATURE_CATALOG[featureKey] : undefined;

    if (!feature) {
      return 'value must be a boolean, integer, or string';
    }

    const expected =
      feature.storage_type === 'bool'
        ? 'boolean'
        : feature.storage_type === 'int'
          ? 'integer'
          : 'string';

    return `value for feature '${featureKey}' must be a ${expected}`;
  }
}

function MatchesFeatureValueType(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: MatchesFeatureValueTypeConstraint,
    });
  };
}

// =============================================================================
// Standalone: value must be boolean, integer, or string — no objects/arrays/null
// =============================================================================

@ValidatorConstraint({ name: 'isPrimitiveValue', async: false })
class IsPrimitiveValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isInteger(value)) ||
      typeof value === 'string'
    );
  }

  defaultMessage(): string {
    return 'value must be a boolean, integer, or string';
  }
}

function IsPrimitiveValue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPrimitiveValueConstraint,
    });
  };
}

// =============================================================================
// DTOs
// =============================================================================

/**
 * DTO for applying an entitlement override.
 * `value` is dynamically validated against the feature's storage_type:
 *   - quota/capacity/metered/rate_limit features → integer
 *   - simple boolean features (redlining_enabled, etc.) → boolean
 *   - tiered string features (template_library, data_isolation, etc.) → string
 */
export class ApplyOverrideDto {
  @ApiProperty({
    description: 'Feature key to override',
    example: 'documents_per_month',
    enum: ALL_FEATURE_KEYS,
  })
  @IsEnum(ALL_FEATURE_KEYS, {
    message: 'Invalid feature key',
  })
  @IsNotEmpty()
  featureKey: FeatureKey;

  @ApiProperty({
    description:
      'Value for the override. Type must match the feature: boolean for on/off features, integer for quota/capacity features, string for tiered features.',
    oneOf: [
      { type: 'boolean', example: true },
      { type: 'integer', example: 500 },
      { type: 'string', example: 'full' },
    ],
  })
  @IsNotEmpty()
  @MatchesFeatureValueType()
  value: boolean | number | string;

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
  })
  @Type(() => Date)
  @IsDate()
  expiresAt: Date;
}

/**
 * Used for programmatic service-level validation of value type once the feature key is known.
 * Call `validateOverrideValue(featureKey, value)` in the service after fetching the override.
 */
export class OverrideValueValidationDto {
  @IsEnum(ALL_FEATURE_KEYS, { message: 'Invalid feature key' })
  featureKey: FeatureKey;

  @IsNotEmpty()
  @MatchesFeatureValueType()
  value: boolean | number | string;
}

/**
 * DTO for updating an override.
 * `value` type is validated at service level against the existing override's feature.
 */
export class UpdateOverrideDto {
  @ApiProperty({
    description:
      'New value for the override. Type must match the feature (boolean, integer, or string).',
    oneOf: [
      { type: 'boolean', example: false },
      { type: 'integer', example: 1000 },
      { type: 'string', example: 'enterprise' },
    ],
    required: false,
  })
  @IsOptional()
  @IsPrimitiveValue()
  value?: boolean | number | string;

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
  @Type(() => Date)
  @IsDate()
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

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { PlanKey } from 'src/common/types/entitlement.types';
import { ALL_PLAN_KEYS } from '../../../common/constants/plan-entitlements.constant';

export class CreateTenantDto {
  @ApiProperty({
    description: 'Organization name',
    example: 'Acme Legal LLC',
    required: true,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    example: 'navigator',
    enum: ALL_PLAN_KEYS,
    description: 'Subscription plan',
    default: 'navigator',
  })
  @IsEnum(ALL_PLAN_KEYS)
  @IsOptional()
  planKey?: PlanKey;
}

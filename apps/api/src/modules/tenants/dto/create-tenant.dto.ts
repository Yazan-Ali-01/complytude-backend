import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { PlanKey } from 'src/common/types/entitlement.types';
import { ALL_PLAN_KEYS } from '../../../common/constants/plan-entitlements.constant';

export class CreateTenantDto {
  @ApiProperty({
    description: 'Organization name',
    example: 'Acme Legal LLC',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

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

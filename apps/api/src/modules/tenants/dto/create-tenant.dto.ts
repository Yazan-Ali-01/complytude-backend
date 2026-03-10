import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import type { PlanKey } from 'src/common/types/entitlement.types';
import { ALL_PLAN_KEYS } from '../../../common/constants/plan-entitlements.constant';

export class CreateTenantDto {
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

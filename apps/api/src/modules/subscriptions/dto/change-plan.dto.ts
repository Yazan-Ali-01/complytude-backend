import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import type { PlanKey } from 'src/common/types/entitlement.types';
import { ALL_PLAN_KEYS } from '../../../common/constants/plan-entitlements.constant';

/**
 * Change Plan DTO — used by POST /billing/plan/change
 */
export class ChangePlanDto {
  @ApiProperty({
    description: 'New plan key to switch to',
    enum: ALL_PLAN_KEYS,
    example: 'general_counsel',
  })
  @IsEnum(ALL_PLAN_KEYS, {
    message: `planKey must be one of: ${ALL_PLAN_KEYS.join(', ')}`,
  })
  @IsNotEmpty()
  planKey: PlanKey;
}

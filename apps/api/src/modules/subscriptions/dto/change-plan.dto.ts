import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import type { PlanKey } from 'src/common/types/entitlement.types';

/**
 * Change Plan DTO
 *
 * Used for POST /subscriptions/change-plan endpoint
 */
export class ChangePlanDto {
  @ApiProperty({
    description: 'New plan key to switch to',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    example: 'general_counsel',
  })
  @IsEnum(['navigator', 'shield', 'general_counsel', 'infrastructure'], {
    message:
      'planKey must be one of: navigator, shield, general_counsel, infrastructure',
  })
  @IsNotEmpty()
  planKey: PlanKey;
}

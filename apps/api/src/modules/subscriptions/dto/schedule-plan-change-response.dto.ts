import { ApiProperty } from '@nestjs/swagger';
import type { PlanKey } from 'src/common/types/entitlement.types';

export class SchedulePlanChangeResponseDto {
  @ApiProperty({
    description: 'Date when the plan change will take effect',
    example: '2026-04-01T00:00:00Z',
  })
  scheduledFor: Date;

  @ApiProperty({
    description: 'Plan key that will be applied',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    example: 'general_counsel',
  })
  newPlanKey: PlanKey;

  @ApiProperty({
    description: 'Current plan key',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    example: 'shield',
  })
  currentPlanKey: PlanKey;

  @ApiProperty({
    description: 'Stripe Subscription Schedule ID',
    example: 'sub_sched_1ABC...',
  })
  stripeScheduleId: string;
}

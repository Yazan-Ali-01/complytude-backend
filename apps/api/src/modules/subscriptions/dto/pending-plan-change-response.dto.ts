import { ApiProperty } from '@nestjs/swagger';
import type { PlanKey } from 'src/common/types/entitlement.types';

export class PendingPlanChangeResponseDto {
  @ApiProperty({
    description: 'Whether there is a pending plan change scheduled',
    example: true,
  })
  hasPendingChange: boolean;

  @ApiProperty({
    description: 'Date when the plan change will take effect (if scheduled)',
    example: '2026-04-01T00:00:00Z',
    required: false,
  })
  scheduledFor?: Date;

  @ApiProperty({
    description: 'Plan key that will be applied (if scheduled)',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    example: 'general_counsel',
    required: false,
  })
  newPlanKey?: PlanKey;

  @ApiProperty({
    description: 'Stripe Subscription Schedule ID (if scheduled)',
    example: 'sub_sched_1ABC...',
    required: false,
  })
  stripeScheduleId?: string;
}

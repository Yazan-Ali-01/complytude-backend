import { ApiProperty } from '@nestjs/swagger';
import type { PlanKey } from 'src/common/types/entitlement.types';
import { SubscriptionResponseDto } from '../../subscriptions/dto/subscription-response.dto';

class BillingLastPaymentFailureDto {
  @ApiProperty({
    description: 'Stripe invoice ID',
    example: 'in_1ABC...',
  })
  invoice_id: string;

  @ApiProperty({
    description: 'Amount due in smallest currency unit (e.g. cents)',
    example: 9900,
  })
  amount: number;

  @ApiProperty({
    description: 'Number of failed payment attempts so far',
    example: 2,
  })
  attempt_count: number;

  @ApiProperty({
    description: 'Next scheduled retry date, or null if no more retries',
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-03-15T00:00:00.000Z',
  })
  next_attempt: Date | null;

  @ApiProperty({
    description: 'When the most recent payment attempt failed',
    example: '2026-03-08T12:00:00.000Z',
  })
  failed_at: Date;
}

class BillingPaymentActionRequiredDto {
  @ApiProperty({
    description:
      'Stripe-hosted invoice URL for the customer to complete payment',
    example: 'https://invoice.stripe.com/i/acct_...',
  })
  invoice_url: string;

  @ApiProperty({
    description: 'Amount due in smallest currency unit (e.g. cents)',
    example: 9900,
  })
  amount: number;
}

class BillingDunningDto {
  @ApiProperty({
    description: 'Details of the most recent failed payment attempt',
    type: BillingLastPaymentFailureDto,
    required: false,
  })
  last_payment_failure?: BillingLastPaymentFailureDto;

  @ApiProperty({
    description:
      'Present when 3D Secure or another action is required to complete payment',
    type: BillingPaymentActionRequiredDto,
    required: false,
  })
  payment_action_required?: BillingPaymentActionRequiredDto;
}

class BillingPendingPlanChangeDto {
  @ApiProperty({
    description:
      'Plan key that will be applied at the end of the current period',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    example: 'general_counsel',
  })
  new_plan_key: PlanKey;

  @ApiProperty({
    description: 'When the plan change takes effect',
    example: '2026-04-01T00:00:00Z',
  })
  scheduled_for: Date;
}

export class BillingStatusResponseDto {
  @ApiProperty({
    description: 'Current subscription',
    type: SubscriptionResponseDto,
  })
  subscription: SubscriptionResponseDto;

  @ApiProperty({
    description:
      'Whether the subscription will cancel at the end of the current period',
    example: false,
  })
  cancel_at_period_end: boolean;

  @ApiProperty({
    description: 'Pending plan change scheduled for period end, if any',
    type: BillingPendingPlanChangeDto,
    required: false,
  })
  pending_plan_change?: BillingPendingPlanChangeDto;

  @ApiProperty({
    description:
      'Dunning state — only present when subscription status is past_due',
    type: BillingDunningDto,
    required: false,
  })
  dunning?: BillingDunningDto;
}

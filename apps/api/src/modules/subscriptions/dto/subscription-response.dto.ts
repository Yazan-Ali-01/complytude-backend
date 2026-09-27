import { ApiProperty } from '@nestjs/swagger';
import type {
  Plan,
  PlanKey,
  SubscriptionStatus,
  TenantSubscription,
} from 'src/common/types/entitlement.types';
import { SUBSCRIPTION_STATUSES } from '../../../common/constants/entitlement-constants';

class PendingPlanChangeDto {
  @ApiProperty({
    description: 'Plan key that will be applied at period end',
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

export class SubscriptionResponseDto {
  @ApiProperty({
    description: 'Subscription ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Tenant ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  tenant_id: string;

  @ApiProperty({
    description: 'Plan ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  plan_id: string;

  @ApiProperty({
    description: 'Subscription status',
    enum: SUBSCRIPTION_STATUSES,
    example: 'active',
  })
  status: SubscriptionStatus;

  @ApiProperty({
    description: 'Billing period start date',
    example: '2026-01-01T00:00:00Z',
  })
  billing_period_start: Date;

  @ApiProperty({
    description: 'Billing period end date',
    example: '2027-01-01T00:00:00Z',
  })
  billing_period_end: Date;

  @ApiProperty({
    description: 'Current period start date',
    example: '2026-02-01T00:00:00Z',
  })
  current_period_start: Date;

  @ApiProperty({
    description: 'Current period end date',
    example: '2026-03-01T00:00:00Z',
  })
  current_period_end: Date;

  @ApiProperty({
    description: 'Cancellation date (if cancelled)',
    example: '2026-02-15T00:00:00Z',
    required: false,
  })
  cancelled_at?: Date;

  @ApiProperty({
    description: 'Additional metadata',
    example: {},
  })
  metadata: Record<string, unknown>;

  @ApiProperty({
    description: 'Creation date',
    example: '2026-01-01T00:00:00Z',
  })
  created_at: Date;

  @ApiProperty({
    description: 'Last update date',
    example: '2026-02-01T00:00:00Z',
  })
  updated_at: Date;

  @ApiProperty({
    description: 'Plan details (included in some endpoints)',
    required: false,
  })
  plan?: Plan;

  @ApiProperty({
    description: 'Stripe subscription ID',
    example: 'sub_1ABC...',
    required: false,
  })
  stripe_subscription_id?: string;

  @ApiProperty({
    description: 'Stripe-reported subscription status',
    example: 'active',
    required: false,
  })
  stripe_status?: string;

  @ApiProperty({
    description:
      'Whether the subscription is scheduled to cancel at period end',
    example: false,
    required: false,
  })
  cancel_at_period_end?: boolean;

  @ApiProperty({
    description: 'Pending plan change scheduled at period end',
    type: PendingPlanChangeDto,
    required: false,
  })
  pending_plan_change?: PendingPlanChangeDto;

  @ApiProperty({
    description: 'Billing interval (monthly or annual)',
    enum: ['monthly', 'annual'],
    example: 'monthly',
    required: false,
  })
  billing_interval?: 'monthly' | 'annual';

  @ApiProperty({
    description: 'Plan key (e.g., navigator, general_counsel)',
    example: 'general_counsel',
    required: false,
  })
  planKey?: string;

  @ApiProperty({
    description: 'Trial end date (only present when status = trialing)',
    example: '2026-04-01T00:00:00.000Z',
    required: false,
  })
  trialEndsAt?: Date;

  @ApiProperty({
    description:
      'Days remaining in trial, clamped to 0 (only present when status = trialing)',
    example: 12,
    required: false,
  })
  daysRemaining?: number;

  static fromEntity(
    subscription: TenantSubscription,
    plan?: Plan,
  ): SubscriptionResponseDto {
    const dto = Object.assign(new SubscriptionResponseDto(), {
      id: subscription.id,
      tenant_id: subscription.tenant_id,
      plan_id: subscription.plan_id,
      status: subscription.status,
      billing_period_start: subscription.billing_period_start,
      billing_period_end: subscription.billing_period_end,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancelled_at: subscription.cancelled_at,
      metadata: subscription.metadata ?? {},
      created_at: subscription.created_at,
      updated_at: subscription.updated_at,
      plan,
      stripe_subscription_id: subscription.stripe_subscription_id ?? undefined,
      stripe_status: subscription.stripe_status ?? undefined,
      cancel_at_period_end: subscription.cancel_at_period_end,
      billing_interval: subscription.billing_interval ?? undefined,
      planKey: plan?.key,
    });

    if (subscription.status === 'trialing' && subscription.trial_ends_at) {
      dto.trialEndsAt = subscription.trial_ends_at;
      dto.daysRemaining = Math.max(
        0,
        Math.ceil(
          (subscription.trial_ends_at.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      );
    }

    return dto;
  }
}

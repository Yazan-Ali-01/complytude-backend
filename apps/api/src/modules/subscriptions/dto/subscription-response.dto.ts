import { ApiProperty } from '@nestjs/swagger';
import type {
  Plan,
  SubscriptionStatus,
  TenantSubscription,
} from 'src/common/types/entitlement.types';

/**
 * Subscription Response DTO
 *
 * Used for all subscription endpoints
 */
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
    enum: ['active', 'cancelled', 'past_due', 'trialing'],
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
  metadata: Record<string, any>;

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

  static fromEntity(
    subscription: TenantSubscription,
    plan?: Plan,
  ): SubscriptionResponseDto {
    return Object.assign(new SubscriptionResponseDto(), {
      id: subscription.id,
      tenant_id: subscription.tenant_id,
      plan_id: subscription.plan_id,
      status: subscription.status,
      billing_period_start: subscription.billing_period_start,
      billing_period_end: subscription.billing_period_end,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancelled_at: subscription.cancelled_at,
      metadata: subscription.metadata,
      created_at: subscription.created_at,
      updated_at: subscription.updated_at,
      plan,
    });
  }
}

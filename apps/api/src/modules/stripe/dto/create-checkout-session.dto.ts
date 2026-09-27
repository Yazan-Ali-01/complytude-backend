import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { PlanKey } from 'src/common/types/entitlement.types';

const PAID_PLAN_KEYS: Exclude<PlanKey, 'navigator'>[] = [
  'shield',
  'general_counsel',
  'infrastructure',
];

export class CreateCheckoutSessionDto {
  @ApiProperty({
    description: 'Plan key to subscribe to (paid plans only)',
    enum: PAID_PLAN_KEYS,
    example: 'shield',
  })
  @IsEnum(PAID_PLAN_KEYS, {
    message: `planKey must be one of: ${PAID_PLAN_KEYS.join(', ')}`,
  })
  planKey: Exclude<PlanKey, 'navigator'>;

  @ApiProperty({
    description: 'Billing interval',
    enum: ['monthly', 'annual'],
    example: 'monthly',
  })
  @IsIn(['monthly', 'annual'])
  interval: 'monthly' | 'annual';

  @ApiProperty({
    description: 'URL to redirect to after successful payment',
    example: 'https://app.complytude.com/settings/billing?success=true',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  successUrl: string;

  @ApiProperty({
    description: 'URL to redirect to if the user cancels',
    example: 'https://app.complytude.com/settings/billing?cancelled=true',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  cancelUrl: string;
}

export class CheckoutSessionResponseDto {
  @ApiProperty({
    description: 'Stripe Checkout hosted URL — redirect the user here',
    example: 'https://checkout.stripe.com/pay/cs_test_...',
  })
  @IsString()
  checkoutUrl: string;

  @ApiProperty({
    description: 'Stripe Checkout Session ID',
    example: 'cs_test_...',
  })
  @IsString()
  sessionId: string;
}

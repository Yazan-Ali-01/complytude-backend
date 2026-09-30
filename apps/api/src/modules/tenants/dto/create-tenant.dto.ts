import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Self-service tenant creation payload.
 *
 * Plan selection is intentionally omitted here. New tenants always start on the
 * 14-day `general_counsel` trial (see `TRIAL_CONFIG`). Paid plans are granted
 * exclusively through Stripe Checkout + webhooks (see `StripeCheckoutService`),
 * which keeps "only Stripe can grant paid plans" as a hard invariant and
 * prevents a billing bypass at signup.
 */
export class CreateTenantDto {
  @ApiProperty({
    description: 'Organization name',
    example: 'Acme Legal LLC',
    required: true,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    description:
      'The AI processing checkbox: the disclosure version the user accepted for the organization (must be the current one, see GET /tenants/me/ai-consent). Omit when unchecked; contract analysis is then refused until a tenant admin accepts it later.',
    example: '2026-10-01',
    required: false,
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  aiDisclosureVersion?: string;
}

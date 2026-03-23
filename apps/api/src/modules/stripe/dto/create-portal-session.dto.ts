import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class CreatePortalSessionDto {
  @ApiProperty({
    description: 'URL to redirect to after the user leaves the portal',
    example: 'https://app.complytude.com/settings/billing',
  })
  @IsUrl({ require_tld: false })
  returnUrl: string;
}

export class PortalSessionResponseDto {
  @ApiProperty({
    description: 'Stripe Customer Portal URL — redirect the user here',
    example: 'https://billing.stripe.com/session/...',
  })
  @IsString()
  url: string;
}

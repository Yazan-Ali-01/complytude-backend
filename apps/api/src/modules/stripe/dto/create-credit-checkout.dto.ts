import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { CREDIT_PACKAGES } from 'src/common/constants/credit-packages.constant';

const CREDIT_PACKAGE_KEYS = CREDIT_PACKAGES.map((p) => p.key);

export class CreateCreditCheckoutDto {
  @ApiProperty({
    description: 'Credit package key',
    enum: CREDIT_PACKAGE_KEYS,
    example: 'credits_50',
  })
  @IsString()
  @IsNotEmpty()
  packageKey: string;

  @ApiProperty({
    description: 'URL to redirect to after successful payment',
    example: 'https://app.complytude.com/settings/billing?credit_success=true',
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

export class CreditPackageCatalogItemDto {
  @ApiProperty({ example: 'credits_50' })
  key: string;

  @ApiProperty({ example: '50 Credits' })
  name: string;

  @ApiProperty({ example: 50 })
  credits: number;

  @ApiProperty({ example: 49 })
  price: number;

  @ApiProperty({ example: 'AED' })
  currency: string;
}

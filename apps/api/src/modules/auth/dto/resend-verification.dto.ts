import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from 'src/common/decorators/normalize-email.decorator';

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email address of the account to verify',
    example: 'user@example.com',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

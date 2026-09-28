import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email address of the account to verify',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;
}

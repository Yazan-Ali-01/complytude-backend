import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizeEmail } from 'src/common/decorators/normalize-email.decorator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'User email address to send password reset link',
    example: 'user@example.com',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

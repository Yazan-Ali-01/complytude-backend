import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsNewPassword } from 'src/common/decorators/new-password.decorator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token from email',
    example: 'abc123def456ghi789',
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'New password (minimum 8 characters)',
    example: 'NewTest123!@#',
    minLength: 8,
  })
  @IsNewPassword()
  newPassword: string;
}

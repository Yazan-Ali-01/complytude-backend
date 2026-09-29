import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsNewPassword } from 'src/common/decorators/new-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password',
    example: 'CurrentPassword123!',
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'New password (minimum 8 characters)',
    example: 'NewTest123!@#',
    minLength: 8,
  })
  @IsNewPassword()
  newPassword: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';
import { NormalizeEmail } from 'src/common/decorators/normalize-email.decorator';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'Test123!@#',
  })
  @IsString()
  password: string;
}

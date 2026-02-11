import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token sent to user email',
    example: 'abc123def456ghi789',
  })
  @IsString()
  token: string;
}

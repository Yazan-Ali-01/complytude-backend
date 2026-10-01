import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiPropertyOptional({
    description:
      'Current password. Required when the account has one; an SSO-only account confirms with its session.',
    example: 'CurrentPassword123!',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;
}

import { IsString, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({
    description: 'User role in the workspace',
    enum: ['admin', 'member', 'viewer'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'member', 'viewer'])
  role?: string;

  @ApiProperty({
    description: 'Whether user access is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

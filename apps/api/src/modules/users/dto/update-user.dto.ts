import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { SystemTenantRole } from 'src/common/types';

export class UpdateUserDto {
  @ApiProperty({
    description: 'User role key in the tenant (system role or custom role)',
    example: SystemTenantRole.MEMBER,
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]+$/, {
    message: 'Role key must contain only lowercase letters and underscores',
  })
  role?: string;

  @ApiProperty({
    description: 'Whether user access is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

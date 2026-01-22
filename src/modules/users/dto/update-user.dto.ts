import { IsString, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { TenantRole } from '../../rbac/types/rbac.types';

export class UpdateUserDto {
  @ApiProperty({
    description: 'User role in the tenant',
    enum: ['tenant_admin', 'legal_counsel', 'member', 'viewer'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['tenant_admin', 'legal_counsel', 'member', 'viewer'])
  role?: TenantRole;

  @ApiProperty({
    description: 'Whether user access is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

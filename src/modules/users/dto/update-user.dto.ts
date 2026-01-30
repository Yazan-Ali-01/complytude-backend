import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { TenantRole } from 'src/common/types';

export class UpdateUserDto {
  @ApiProperty({
    description: 'User role in the tenant',
    enum: Object.values(TenantRole),
    example: TenantRole.MEMBER,
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(Object.values(TenantRole))
  role?: TenantRole;

  @ApiProperty({
    description: 'Whether user access is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

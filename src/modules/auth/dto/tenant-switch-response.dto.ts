import { ApiProperty } from '@nestjs/swagger';
import { TenantRole } from 'src/common/types';

/**
 * Tenant information in tenant switch response
 */
export class TenantSwitchTenantDto {
  @ApiProperty({
    description: 'Tenant unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Tenant/company name',
    example: 'Acme Corporation',
  })
  name: string;
}

/**
 * User information in tenant switch response
 */
export class TenantSwitchUserDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User role within the selected tenant',
    enum: Object.values(TenantRole),
    example: TenantRole.MEMBER,
  })
  role: TenantRole;
}

/**
 * Response returned after successful tenant switch
 */
export class TenantSwitchResponseDto {
  @ApiProperty({
    description: 'Selected tenant information',
    type: TenantSwitchTenantDto,
  })
  tenant: TenantSwitchTenantDto;

  @ApiProperty({
    description: 'User information with role in selected tenant',
    type: TenantSwitchUserDto,
  })
  user: TenantSwitchUserDto;
}

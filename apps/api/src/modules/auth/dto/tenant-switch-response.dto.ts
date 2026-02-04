import { ApiProperty } from '@nestjs/swagger';
import { SystemTenantRole } from 'src/common/types';

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
    description: 'User role key within the selected tenant',
    example: SystemTenantRole.MEMBER,
  })
  role: string;

  @ApiProperty({
    description: 'User role display name',
    example: 'Member',
  })
  roleName: string;
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

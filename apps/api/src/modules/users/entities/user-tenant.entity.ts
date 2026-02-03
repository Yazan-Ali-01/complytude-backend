import { ApiProperty } from '@nestjs/swagger';
import { SystemTenantRole } from 'src/common/types';

export class UserTenant {
  @ApiProperty({ description: 'User ID' })
  user_id: string;

  @ApiProperty({ description: 'Tenant ID (UUID)' })
  tenant_id: string;

  @ApiProperty({
    description: 'Role key within this tenant (system role or custom role)',
    example: SystemTenantRole.MEMBER,
  })
  role_key: string;

  @ApiProperty({
    description: 'Role display name (from roles table)',
    example: 'Member',
  })
  role_name: string;

  @ApiProperty({ description: 'Whether user access is active' })
  is_active: boolean;

  @ApiProperty({ description: 'When user joined the tenant' })
  joined_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;
}

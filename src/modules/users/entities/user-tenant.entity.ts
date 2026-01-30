import { ApiProperty } from '@nestjs/swagger';
import { TenantRole } from 'src/common/types';

export class UserTenant {
  @ApiProperty({ description: 'User ID' })
  user_id: string;

  @ApiProperty({ description: 'Tenant ID (UUID)' })
  tenant_id: string;

  @ApiProperty({
    description: 'User role in the tenant',
    enum: Object.values(TenantRole),
    example: TenantRole.MEMBER,
  })
  role: TenantRole;

  @ApiProperty({ description: 'Whether user access is active' })
  is_active: boolean;

  @ApiProperty({ description: 'When user joined the tenant' })
  joined_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;
}

import { ApiProperty } from '@nestjs/swagger';

export class UserTenant {
  @ApiProperty({ description: 'User ID' })
  user_id: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenant_id: string;

  @ApiProperty({
    description: 'User role in the tenant',
    enum: ['admin', 'member', 'viewer'],
  })
  role: string;

  @ApiProperty({ description: 'Whether user access is active' })
  is_active: boolean;

  @ApiProperty({ description: 'When user joined the tenant' })
  joined_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;

  @ApiProperty({ description: 'Schema name' })
  schema_name: string;
}

import { ApiProperty } from '@nestjs/swagger';

export class UserWorkspace {
  @ApiProperty({ description: 'User ID' })
  user_id: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspace_id: string;

  @ApiProperty({
    description: 'User role in the workspace',
    enum: ['admin', 'member', 'viewer'],
  })
  role: string;

  @ApiProperty({ description: 'Whether user access is active' })
  is_active: boolean;

  @ApiProperty({ description: 'When user joined the workspace' })
  joined_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;
}

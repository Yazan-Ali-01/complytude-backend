import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class User {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User email address' })
  email: string;

  @Exclude()
  password_hash: string;

  @ApiProperty({ description: 'User first name' })
  first_name: string | null;

  @ApiProperty({ description: 'User last name' })
  last_name: string | null;

  @ApiProperty({ description: 'Email verification status' })
  is_verified: boolean;

  @ApiProperty({
    description: 'Platform role key (null for tenant-only users)',
    example: 'system_admin',
    nullable: true,
  })
  platform_role_key: string | null;

  @ApiProperty({ description: 'Account creation timestamp' })
  created_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}

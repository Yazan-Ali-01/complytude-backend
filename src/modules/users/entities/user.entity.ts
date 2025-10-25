import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class User {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User email address' })
  email: string;

  @Exclude()
  password_hash: string;

  @ApiProperty({ description: 'User first name', required: false })
  first_name?: string;

  @ApiProperty({ description: 'User last name', required: false })
  last_name?: string;

  @ApiProperty({ description: 'Email verification status' })
  is_verified: boolean;

  @ApiProperty({ description: 'Account creation timestamp' })
  created_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}

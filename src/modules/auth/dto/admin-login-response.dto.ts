import { ApiProperty } from '@nestjs/swagger';

/**
 * Admin user information returned in admin login response
 */
export class AdminLoginUserDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'admin@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'Admin',
    nullable: true,
  })
  firstName: string | null;

  @ApiProperty({
    description: 'User last name',
    example: 'User',
    nullable: true,
  })
  lastName: string | null;

  @ApiProperty({
    description: 'System administrator status',
    example: true,
  })
  isSystemAdmin: boolean;
}

/**
 * Response returned after successful admin login
 * Contains full authentication tokens (no tenant selection needed)
 */
export class AdminLoginResponseDto {
  @ApiProperty({
    description: 'Admin user information',
    type: AdminLoginUserDto,
  })
  user: AdminLoginUserDto;

  constructor(data: AdminLoginResponseDto) {
    Object.assign(this, data);
  }
}

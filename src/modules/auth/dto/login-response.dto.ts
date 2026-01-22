import { ApiProperty } from '@nestjs/swagger';

/**
 * User information returned in login response
 */
export class LoginUserDto {
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
    description: 'User first name',
    example: 'John',
    nullable: true,
  })
  firstName: string | null;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    nullable: true,
  })
  lastName: string | null;
}

/**
 * Tenant information returned in login response
 */
export class LoginTenantDto {
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
 * Response returned after successful login
 * Contains temporary authentication and list of user's tenants
 */
export class LoginResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Login successful. Please select a tenant.',
  })
  message: string;

  @ApiProperty({
    description: 'User information',
    type: LoginUserDto,
  })
  user: LoginUserDto;

  @ApiProperty({
    description: 'List of tenants user belongs to',
    type: [LoginTenantDto],
    isArray: true,
  })
  tenants: LoginTenantDto[];
}

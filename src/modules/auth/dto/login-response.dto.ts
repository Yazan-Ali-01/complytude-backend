import { ApiProperty } from '@nestjs/swagger';
import { TenantRole } from 'src/common/types';

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
  tenantId: string;

  @ApiProperty({
    description: 'Tenant/company name',
    example: 'Acme Corporation',
  })
  tenantName: string;

  @ApiProperty({
    description: 'User role within the tenant',
    enum: Object.values(TenantRole),
    example: TenantRole.MEMBER,
  })
  role: TenantRole;

  @ApiProperty({
    description: 'Whether user access is active in this tenant',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'When user joined the tenant',
    example: '2026-01-15T08:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  joinedAt: string;
}

/**
 * Response returned after successful login
 * Contains temporary authentication and list of user's tenants
 */
export class LoginResponseDto {
  @ApiProperty({
    description: 'User information',
    type: LoginUserDto,
  })
  user: LoginUserDto;

  @ApiProperty({
    description: 'List of tenants user belongs to',
    type: [LoginTenantDto],
    isArray: true,
    example: [
      {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        tenantName: 'Acme Corporation',
        role: TenantRole.ADMIN,
        isActive: true,
        joinedAt: '2026-01-10T08:00:00.000Z',
      },
      {
        tenantId: '660e8400-e29b-41d4-a716-446655440001',
        tenantName: 'TechStart LLC',
        role: TenantRole.MEMBER,
        isActive: true,
        joinedAt: '2026-01-15T10:30:00.000Z',
      },
    ],
  })
  tenants: LoginTenantDto[];

  @ApiProperty({
    description: 'Number of pending invitations for this user',
    example: 2,
    type: 'integer',
  })
  pendingInvitationsCount: number;

  constructor(data: LoginResponseDto) {
    Object.assign(this, data);
  }
}

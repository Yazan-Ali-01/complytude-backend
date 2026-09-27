import { ApiProperty } from '@nestjs/swagger';
import { SystemTenantRole } from 'src/common/types';
import { Tenant } from '../../tenants/entities/tenant.entity';
/**
 * User profile response DTO
 * Returns current user profile with all details (excludes password)
 */
export class UserProfileResponseDto {
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

  @ApiProperty({
    description: 'Email verification status',
    example: true,
  })
  isVerified: boolean;

  @ApiProperty({
    description: 'Platform role key (null for tenant-only users)',
    example: 'system_admin',
    nullable: true,
  })
  platformRole: string | null;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2026-01-21T10:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-01-21T12:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  updatedAt: string;
}

/**
 * User tenant membership response DTO
 * Returns tenant membership info including role
 */
export class UserTenantResponseDto {
  @ApiProperty({
    description: 'Tenant unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Tenant name',
    example: 'Acme Corporation',
  })
  tenantName: string;

  @ApiProperty({
    description: 'User role key within the tenant',
    example: SystemTenantRole.MEMBER,
  })
  role: string;

  @ApiProperty({
    description: 'User role display name',
    example: 'Member',
  })
  roleName: string;

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
 * Current tenant info response DTO
 * Returns tenant details resolved from JWT token
 */
// TODO to use this approach and not follow the lazy approach
export class TenantInfoResponseDto {
  constructor(data: Tenant) {
    this.id = data.id;
    this.isActive = data.is_active;
    this.createdAt = data.created_at.toISOString();
    this.updatedAt = data.updated_at.toISOString();
  }

  @ApiProperty({
    description: 'Tenant unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Whether tenant is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Tenant creation timestamp',
    example: '2026-01-10T10:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-01-20T15:45:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  updatedAt: string;
}

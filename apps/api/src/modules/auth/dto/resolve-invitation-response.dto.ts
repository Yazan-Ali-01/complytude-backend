import { ApiProperty } from '@nestjs/swagger';
import { SystemTenantRole } from 'src/common/types';

/**
 * Information about who sent the invitation
 */
export class InvitationInvitedByDto {
  @ApiProperty({
    description: 'Email of the user who sent the invitation',
    example: 'admin@company.com',
  })
  email: string;

  @ApiProperty({
    description: 'Full name of the user who sent the invitation',
    example: 'Admin User',
    nullable: true,
  })
  name: string | null;
}

/**
 * Response returned when resolving an invitation token
 * Contains all invitation details for frontend to display
 */
export class ResolveInvitationResponseDto {
  @ApiProperty({
    description: 'Invitation unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  invitationId: string;

  @ApiProperty({
    description: 'Email address of the invited user',
    example: 'invitee@example.com',
  })
  email: string;

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
    description: 'Role key the user will have in the tenant',
    example: SystemTenantRole.MEMBER,
  })
  role: string;

  @ApiProperty({
    description: 'Role display name',
    example: 'Member',
  })
  roleName: string;

  @ApiProperty({
    description: 'Information about who sent the invitation',
    type: InvitationInvitedByDto,
  })
  invitedBy: InvitationInvitedByDto;

  @ApiProperty({
    description: 'Invitation expiration timestamp (ISO 8601)',
    example: '2026-02-21T10:00:00.000Z',
  })
  expiresAt: string;

  @ApiProperty({
    description: 'Invitation creation timestamp (ISO 8601)',
    example: '2026-01-21T10:00:00.000Z',
  })
  createdAt: string;
}

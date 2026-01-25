import { ApiProperty } from '@nestjs/swagger';
import { InvitationInvitedByDto } from './resolve-invitation-response.dto';

/**
 * Single invitation item in the list
 */
export class InvitationItemDto {
  @ApiProperty({
    description: 'Invitation unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

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
    description: 'Role the user will have in the tenant',
    enum: ['admin', 'member', 'viewer'],
    example: 'member',
  })
  role: string;

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

/**
 * Response containing list of pending invitations for the authenticated user
 */
export class InvitationListResponseDto {
  @ApiProperty({
    description: 'Array of pending invitations',
    type: [InvitationItemDto],
    isArray: true,
  })
  invitations: InvitationItemDto[];
}

import { ApiProperty } from '@nestjs/swagger';
import { SystemTenantRole } from 'src/common/types';
import { InvitationStatus } from 'src/repositories/invitations/interfaces/invitation.interface';

/**
 * Information about who sent the invitation
 */
export class InviterInfoDto {
  @ApiProperty({
    description: 'User ID of who sent the invitation',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId: string;

  @ApiProperty({
    description: 'Email of who sent the invitation',
    example: 'admin@company.com',
  })
  email: string;

  @ApiProperty({
    description: 'Full name of who sent the invitation',
    example: 'Admin User',
    nullable: true,
  })
  name: string | null;
}

/**
 * Response containing invitation details
 */
export class InvitationResponseDto {
  @ApiProperty({
    description: 'Invitation unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Email address of the invited user',
    example: 'invitee@example.com',
  })
  email: string;

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
    description: 'Invitation status',
    enum: Object.values(InvitationStatus),
    example: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @ApiProperty({
    description: 'Invitation expiration timestamp (ISO 8601)',
    example: '2026-02-21T10:00:00.000Z',
  })
  expiresAt: string;

  @ApiProperty({
    description: 'Information about who sent the invitation',
    type: InviterInfoDto,
  })
  invitedBy: InviterInfoDto;

  @ApiProperty({
    description: 'Invitation creation timestamp (ISO 8601)',
    example: '2026-01-21T10:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'When invitation was accepted (if accepted)',
    example: '2026-01-22T10:00:00.000Z',
    nullable: true,
    required: false,
  })
  acceptedAt?: string | null;

  @ApiProperty({
    description: 'When invitation was rejected by invitee (if rejected)',
    example: '2026-01-22T12:00:00.000Z',
    nullable: true,
    required: false,
  })
  rejectedAt?: string | null;

  @ApiProperty({
    description: 'When invitation was revoked by admin (if revoked)',
    example: '2026-01-23T10:00:00.000Z',
    nullable: true,
    required: false,
  })
  revokedAt?: string | null;
}

/**
 * Response after creating an invitation
 */
export class CreateInvitationResponseDto {
  @ApiProperty({
    description: 'Created invitation unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  invitationId: string;

  @ApiProperty({
    description:
      'Whether the invitation email was sent. The link (with its token) goes only to the invitee; if false, resend the invitation.',
    example: true,
  })
  emailSent: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'Invitation created successfully',
  })
  message: string;
}

/**
 * Response after resending an invitation
 */
export class ResendInvitationResponseDto {
  @ApiProperty({
    description:
      'Whether the invitation email was sent. The link (with its token) goes only to the invitee; if false, resend the invitation.',
    example: true,
  })
  emailSent: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'Invitation resent successfully',
  })
  message: string;
}

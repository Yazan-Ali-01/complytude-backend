export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'revoked'
  | 'expired';

export enum TenantRole {
  admin = 'admin',
  member = 'member',
  viewer = 'viewer',
}

export interface Invitation {
  id: string;
  email: string;
  tenantId: string;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  role: TenantRole;
  status: InvitationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvitationInput {
  email: string;
  tenantId: string;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
  role?: TenantRole;
}

export interface RevokeInvitationInput {
  revokedBy: string;
}

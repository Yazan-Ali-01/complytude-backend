import { TenantRole } from 'src/common/types';

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
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

export enum TokenType {
  IDENTITY = 'identity',
  TENANT = 'tenant',
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  tokenType: TokenType;
  tenantId: string | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  tokenType: TokenType;
  tenantId?: string | null;
  expiresAt: Date;
}

export interface UpdateRefreshTokenInput {
  tokenHash?: string;
  expiresAt?: Date;
  revokedAt?: Date | null;
}

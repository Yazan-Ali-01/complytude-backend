export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface CreateRefreshTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface UpdateRefreshTokenInput {
  tokenHash?: string;
  expiresAt?: Date;
  revokedAt?: Date | null;
}

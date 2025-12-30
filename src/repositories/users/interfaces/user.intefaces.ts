export interface PasswordReset {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface CreatePasswordResetInput {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

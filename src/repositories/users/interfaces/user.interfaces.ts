export interface PasswordReset {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface CreatePasswordResetInput {
  userId: string;
  token: string;
  expiresAt: Date;
}

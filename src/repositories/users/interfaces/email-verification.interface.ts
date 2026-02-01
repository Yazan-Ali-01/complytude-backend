export interface EmailVerification {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  verifiedAt: Date | null;
}

export interface CreateEmailVerificationInput {
  userId: string;
  token: string;
  expiresAt: Date;
}

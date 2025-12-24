export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  isVerified: boolean;
  isSystemAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  id: string;
  email: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  isVerified?: boolean;
  isSystemAdmin?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  passwordHash?: string;
  firstName?: string | null;
  lastName?: string | null;
  isVerified?: boolean;
  isSystemAdmin?: boolean;
  updatedAt?: Date;
}

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

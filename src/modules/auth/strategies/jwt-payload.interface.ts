export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  isSystemAdmin?: boolean;
  type: 'access' | 'refresh';
}

/**
 * Payload for temporary authentication token (used after login, before tenant selection)
 */
export interface TempAuthPayload {
  sub: string; // userId
  email: string;
  type: 'temp-auth';
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  isSystemAdmin?: boolean;
  type: 'access' | 'refresh';
}

/**
 * Payload for identity token (used after login, before tenant selection)
 */
export interface IdentityPayload {
  sub: string; // userId
  email: string;
  type: 'identity';
}

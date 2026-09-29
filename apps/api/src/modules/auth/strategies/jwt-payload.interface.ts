/**
 * Payload for identity access token (used after login, before tenant selection)
 * Used for: tenant selection, system admin operations, invitations
 */
export const IDENTITY_PAYLOAD_TYPE = 'identity';

export interface IdentityPayload {
  sub: string; // userId
  email: string;
  isVerified: boolean; // Email verification status
  platformRole: string | null; // 'system_admin', 'support', 'auditor', or null
  sessionId: string; // Links to identity-session:{sessionId} in Redis
  type: typeof IDENTITY_PAYLOAD_TYPE;
}

export interface AuthenticatedIdentityUser {
  userId: string;
  email: string;
  isVerified: boolean;
  platformRole: string | null;
  sessionId: string;
}

/**
 * Payload for identity refresh token
 * Used to refresh identity access tokens
 */
export const IDENTITY_REFRESH_PAYLOAD_TYPE = 'identity-refresh';

export interface IdentityRefreshPayload {
  sub: string; // userId
  email: string;
  sessionId: string; // Links to identity-session:{sessionId} in Redis
  jti: string; // Must match the session's refreshJti; rotated on every refresh
  type: typeof IDENTITY_REFRESH_PAYLOAD_TYPE;
}

export interface AuthenticatedIdentityRefreshUser {
  userId: string;
  email: string;
  sessionId: string;
  refreshJti: string;
  refreshToken: string;
}

/**
 * Payload for tenant access token (used after tenant selection)
 * Used for: tenant-scoped API operations
 *
 * Role changes are handled by SessionInvalidationService.invalidateTenantSessions()
 * — deleting the tenant session in Redis invalidates tokens immediately.
 */
export const TENANT_PAYLOAD_TYPE = 'tenant-access';

export interface TenantPayload {
  sub: string; // userId
  email: string;
  tenantId: string;
  role: string;
  sessionId: string; // Links to tenant-session:{sessionId} in Redis
  type: typeof TENANT_PAYLOAD_TYPE;
}

export interface AuthenticatedTenantUser {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  sessionId: string;
}

/**
 * Payload for tenant refresh token
 * Used to refresh tenant access tokens for the same tenant
 */
export const TENANT_REFRESH_PAYLOAD_TYPE = 'tenant-refresh';

export interface TenantRefreshPayload {
  sub: string; // userId
  email: string;
  tenantId: string;
  sessionId: string; // Links to tenant-session:{sessionId} in Redis
  jti: string; // Must match the session's refreshJti; rotated on every refresh
  type: typeof TENANT_REFRESH_PAYLOAD_TYPE;
}

export interface AuthenticatedTenantRefreshUser {
  userId: string;
  email: string;
  tenantId: string;
  sessionId: string;
  refreshJti: string;
  refreshToken: string;
}

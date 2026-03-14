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
  type: typeof IDENTITY_PAYLOAD_TYPE;
}

export interface AuthenticatedIdentityUser {
  userId: string;
  email: string;
  isVerified: boolean;
  platformRole: string | null;
}

/**
 * Payload for identity refresh token
 * Used to refresh identity access tokens
 */
export const IDENTITY_REFRESH_PAYLOAD_TYPE = 'identity-refresh';

export interface IdentityRefreshPayload {
  sub: string; // userId
  email: string;
  type: typeof IDENTITY_REFRESH_PAYLOAD_TYPE;
}

export interface AuthenticatedIdentityRefreshUser {
  userId: string;
  email: string;
  refreshToken: string;
}

/**
 * Payload for tenant access token (used after tenant selection)
 * Used for: tenant-scoped API operations
 *
 * TODO: Implement token revocation for role changes. Currently, if a user's role
 * is changed (e.g., demoted from legal_counsel to member), the old token retains
 * the elevated role until it expires (30-minute window). Consider:
 * - Adding a role version/hash to the token and verifying on critical operations
 * - Implementing a token blacklist for role changes
 * - Using short-lived tokens with more frequent refresh
 */
export const TENANT_PAYLOAD_TYPE = 'tenant-access';

export interface TenantPayload {
  sub: string; // userId
  email: string;
  tenantId: string;
  role: string;
  type: typeof TENANT_PAYLOAD_TYPE;
}

export interface AuthenticatedTenantUser {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
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
  type: typeof TENANT_REFRESH_PAYLOAD_TYPE;
}

export interface AuthenticatedTenantRefreshUser {
  userId: string;
  email: string;
  tenantId: string;
  refreshToken: string;
}

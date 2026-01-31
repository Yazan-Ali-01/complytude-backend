import { TenantRole } from 'src/common/types/tenant.types';

/**
 * Payload for identity access token (used after login, before tenant selection)
 * Used for: tenant selection, system admin operations, invitations
 */
export const IDENTITY_PAYLOAD_TYPE = 'identity';

export interface IdentityPayload {
  sub: string; // userId
  email: string;
  globalRoles: string[]; // ['SYSTEM_ADMIN'] or []
  type: typeof IDENTITY_PAYLOAD_TYPE;
}

export interface AuthenticatedIdentityUser {
  userId: string;
  email: string;
  globalRoles: string[];
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
 */
export const TENANT_PAYLOAD_TYPE = 'tenant-access';

export interface TenantPayload {
  sub: string; // userId
  email: string;
  tenantId: string;
  role: TenantRole;
  type: typeof TENANT_PAYLOAD_TYPE;
}

export interface AuthenticatedTenantUser {
  userId: string;
  email: string;
  tenantId: string;
  role: TenantRole;
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

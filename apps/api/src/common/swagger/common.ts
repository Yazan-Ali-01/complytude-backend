import { ApiCookieAuth } from '@nestjs/swagger';

// Cookie names
export const TENANT_ACCESS_TOKEN_COOKIE_NAME = 'tenantAccessToken';
export const TENANT_REFRESH_TOKEN_COOKIE_NAME = 'tenantRefreshToken';
export const IDENTITY_TOKEN_COOKIE_NAME = 'identityAccessToken';
export const IDENTITY_REFRESH_TOKEN_COOKIE_NAME = 'identityRefreshToken';

// Cookie configuration constants
export const COOKIE_PATH = '/';
export const COOKIE_SAME_SITE = 'strict' as const;

/**
 * Swagger decorator for cookie-based authentication
 * The application uses HTTP-only cookies for JWT tokens
 *
 * Identity Access Token: Short-lived token for tenant selection and system admin operations
 * Identity Refresh Token: Long-lived token for renewing identity access tokens
 * Tenant Access Token: Short-lived token for tenant-scoped API access
 * Tenant Refresh Token: Long-lived token for renewing tenant access tokens
 *
 * Authentication Flow:
 * 1. Login with credentials → Receives identity access + identity refresh tokens
 * 2. Select tenant → Receives tenant access + tenant refresh tokens (keeps identity tokens)
 * 3. Subsequent requests → Browser automatically sends cookies
 * 4. Identity access expires → Use identity refresh to get new identity access
 * 5. Tenant access expires → Use tenant refresh to get new tenant access
 * 6. Refresh tokens expire → User must login again
 */
export const SwaggerCookieAuth = {
  identityAccessToken: () => ApiCookieAuth(IDENTITY_TOKEN_COOKIE_NAME),
  identityRefreshToken: () => ApiCookieAuth(IDENTITY_REFRESH_TOKEN_COOKIE_NAME),
  tenantRefreshToken: () => ApiCookieAuth(TENANT_REFRESH_TOKEN_COOKIE_NAME),
  tenantAccessToken: () => ApiCookieAuth(TENANT_ACCESS_TOKEN_COOKIE_NAME),
};

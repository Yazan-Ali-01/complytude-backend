import { ApiCookieAuth } from '@nestjs/swagger';

// Cookie names
export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

// Cookie configuration constants
export const COOKIE_PATH = '/';
export const COOKIE_SAME_SITE = 'strict' as const;

/**
 * Swagger decorator for cookie-based authentication
 * The application uses HTTP-only cookies for JWT tokens
 *
 * Access Token: Short-lived token (30 minutes) for API access
 * Refresh Token: Long-lived token (14 days) for obtaining new access tokens
 *
 * Authentication Flow:
 * 1. Login with credentials → Receives access + refresh tokens in cookies
 * 2. Subsequent requests → Browser automatically sends cookies
 * 3. Access token expires → Use refresh token to get new access token
 * 4. Refresh token expires → User must login again
 */
export const SwaggerCookieAuth = {
  refreshToken: () => ApiCookieAuth(REFRESH_TOKEN_COOKIE_NAME),
  accessToken: () => ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME),
};

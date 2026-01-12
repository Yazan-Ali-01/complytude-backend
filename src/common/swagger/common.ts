import { ApiCookieAuth } from '@nestjs/swagger';

// Cookie names
export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

// Cookie configuration constants
export const COOKIE_PATH = '/';
export const COOKIE_SAME_SITE = 'strict' as const;

export const SwaggerCookieAuth = {
  refreshToken: () => ApiCookieAuth(REFRESH_TOKEN_COOKIE_NAME),
  accessToken: () => ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME),
};

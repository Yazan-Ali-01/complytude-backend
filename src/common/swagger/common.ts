import { ApiCookieAuth } from '@nestjs/swagger';

export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

export const SwaggerCookieAuth = {
  refreshToken: () => ApiCookieAuth(REFRESH_TOKEN_COOKIE_NAME),
  accessToken: () => ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME),
};

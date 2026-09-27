import { registerAs } from '@nestjs/config';
import {
  isGoogleSsoEnabled,
  isMicrosoftSsoEnabled,
} from 'src/modules/auth/utils/sso-enabled.util';

export default registerAs('sso', () => {
  return {
    google: {
      enabled: isGoogleSsoEnabled(),
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? '',
    },
    microsoft: {
      enabled: isMicrosoftSsoEnabled(),
      clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      callbackUrl: process.env.MICROSOFT_CALLBACK_URL ?? '',
      tenant: process.env.MICROSOFT_TENANT_ID?.trim() || 'common',
    },
    frontendSuccessPath:
      process.env.SSO_FRONTEND_SUCCESS_PATH?.trim() || '/auth/callback',
    frontendErrorPath:
      process.env.SSO_FRONTEND_ERROR_PATH?.trim() || '/auth/error',
  };
});

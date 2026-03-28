import { registerAs } from '@nestjs/config';

function isTruthyEnv(v: string | undefined): boolean {
  return Boolean(v?.trim());
}

export default registerAs('sso', () => {
  const googleEnabled =
    isTruthyEnv(process.env.GOOGLE_CLIENT_ID) &&
    isTruthyEnv(process.env.GOOGLE_CLIENT_SECRET) &&
    isTruthyEnv(process.env.GOOGLE_CALLBACK_URL);

  const microsoftEnabled =
    isTruthyEnv(process.env.MICROSOFT_CLIENT_ID) &&
    isTruthyEnv(process.env.MICROSOFT_CLIENT_SECRET) &&
    isTruthyEnv(process.env.MICROSOFT_CALLBACK_URL);

  return {
    google: {
      enabled: googleEnabled,
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? '',
    },
    microsoft: {
      enabled: microsoftEnabled,
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

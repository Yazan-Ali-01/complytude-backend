/**
 * Pure helpers that check whether SSO providers are configured.
 * Shared by sso.config.ts (runtime config) and auth.module.ts (conditional strategy registration).
 */

function isTruthyEnv(v: string | undefined): boolean {
  return Boolean(v?.trim());
}

export function isGoogleSsoEnabled(): boolean {
  return (
    isTruthyEnv(process.env.GOOGLE_CLIENT_ID) &&
    isTruthyEnv(process.env.GOOGLE_CLIENT_SECRET) &&
    isTruthyEnv(process.env.GOOGLE_CALLBACK_URL)
  );
}

export function isMicrosoftSsoEnabled(): boolean {
  return (
    isTruthyEnv(process.env.MICROSOFT_CLIENT_ID) &&
    isTruthyEnv(process.env.MICROSOFT_CLIENT_SECRET) &&
    isTruthyEnv(process.env.MICROSOFT_CALLBACK_URL)
  );
}

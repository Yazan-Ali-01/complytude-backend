import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  identitySecret: process.env.JWT_IDENTITY_SECRET!,
  identityRefreshSecret: process.env.JWT_IDENTITY_REFRESH_SECRET!,
  refreshHashSecret: process.env.JWT_REFRESH_HASH_SECRET!, // Deprecated - no longer used
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN!,
  // Consolidated TTL: Use SESSION_MAX_TTL for all refresh token expiry
  // Replaces JWT_REFRESH_EXPIRES_IN and JWT_IDENTITY_REFRESH_EXPIRES_IN
  sessionMaxTtl: process.env.SESSION_MAX_TTL!,
  identityExpiresIn: process.env.JWT_IDENTITY_EXPIRES_IN!,
  // Legacy variables kept for backward compatibility during transition
  refreshExpiresIn:
    process.env.JWT_REFRESH_EXPIRES_IN || process.env.SESSION_MAX_TTL!,
  identityRefreshExpiresIn:
    process.env.JWT_IDENTITY_REFRESH_EXPIRES_IN || process.env.SESSION_MAX_TTL!,
}));

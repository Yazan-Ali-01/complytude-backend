import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  identitySecret: process.env.JWT_IDENTITY_SECRET!,
  identityRefreshSecret: process.env.JWT_IDENTITY_REFRESH_SECRET!,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN!,
  /** Identity + tenant refresh JWT TTL — aligned with Redis session max TTL (`SESSION_MAX_TTL`) */
  refreshExpiresIn: process.env.SESSION_MAX_TTL || '14d',
  identityExpiresIn: process.env.JWT_IDENTITY_EXPIRES_IN!,
}));

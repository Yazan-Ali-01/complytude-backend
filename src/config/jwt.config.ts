import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  identitySecret: process.env.JWT_IDENTITY_SECRET!,
  identityRefreshSecret: process.env.JWT_IDENTITY_REFRESH_SECRET!,
  refreshHashSecret: process.env.JWT_REFRESH_HASH_SECRET!,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN!,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN!,
  identityExpiresIn: process.env.JWT_IDENTITY_EXPIRES_IN!,
  identityRefreshExpiresIn: process.env.JWT_IDENTITY_REFRESH_EXPIRES_IN!,
}));

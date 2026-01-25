import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  tempAuthSecret: process.env.JWT_TEMP_AUTH_SECRET!,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN!,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN!,
  tempAuthExpiresIn: process.env.JWT_TEMP_AUTH_EXPIRES_IN!,
  refreshHashSecret: process.env.JWT_REFRESH_HASH_SECRET!,
}));

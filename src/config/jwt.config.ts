import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret:
    process.env.JWT_ACCESS_SECRET || 'your-access-secret-change-in-production',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    'your-refresh-secret-change-in-production',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '14d',
}));

import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT!, 10),
  environment: process.env.NODE_ENV!,
  apiPrefix: process.env.API_PREFIX!,
  corsOrigins: process.env.CORS_ORIGINS!.split(','),
  bullBoard: {
    adminSecret: process.env.BULL_BOARD_ADMIN_SECRET || null,
    port: parseInt(process.env.BULL_BOARD_PORT!, 10),
  },
  entitlement: {
    strictThresholdPercent: parseInt(
      process.env.ENTITLEMENT_STRICT_THRESHOLD_PERCENT || '5',
      10,
    ),
  },
}));

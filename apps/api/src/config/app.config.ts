import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT!, 10),
  environment: process.env.NODE_ENV!,
  apiPrefix: process.env.API_PREFIX!,
  corsOrigins: process.env.CORS_ORIGINS!.split(','),
  entitlement: {
    strictThresholdPercent: parseInt(
      process.env.ENTITLEMENT_STRICT_THRESHOLD_PERCENT || '5',
      10,
    ),
  },
}));

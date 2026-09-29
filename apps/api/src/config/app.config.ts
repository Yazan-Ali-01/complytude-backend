import { registerAs } from '@nestjs/config';

/**
 * CORS_ORIGINS as the origins a browser sends: entries trimmed, empty ones dropped, and each reduced
 * to scheme://host[:port] (an entry with a trailing slash or a path would never match). The env
 * schema has already checked that every entry is an http(s) URL.
 */
export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => new URL(entry).origin);
}

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT!, 10),
  environment: process.env.NODE_ENV!,
  apiPrefix: process.env.API_PREFIX!,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
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

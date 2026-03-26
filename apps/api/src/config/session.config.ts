import { registerAs } from '@nestjs/config';

/**
 * Parse duration string (e.g. '14d', '72h') to seconds.
 */
function parseDurationToSeconds(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 14 * 24 * 60 * 60; // fallback 14 days
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  switch (unit) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 60 * 60;
    case 'd':
      return n * 24 * 60 * 60;
    default:
      return 14 * 24 * 60 * 60;
  }
}

export default registerAs('session', () => ({
  maxTtlSeconds: parseDurationToSeconds(process.env.SESSION_MAX_TTL || '14d'),
  idleTimeoutSeconds: parseDurationToSeconds(
    process.env.SESSION_IDLE_TIMEOUT || '72h',
  ),
  maxPerUser: parseInt(process.env.SESSION_MAX_PER_USER || '5', 10),
  activityThrottleSeconds: parseInt(
    process.env.SESSION_ACTIVITY_THROTTLE_SECONDS || '120',
    10,
  ),
  strictMode: process.env.SESSION_STRICT_MODE === 'true',
}));

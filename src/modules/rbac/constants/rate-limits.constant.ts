/**
 * Rate limiting constants for AI features.
 * These can be overridden via environment variables in production.
 */
export const AiRateLimits = {
  /** Daily AI generation limit for 'member' role */
  MEMBER_DAILY_LIMIT: parseInt(process.env.AI_MEMBER_DAILY_LIMIT || '5', 10),

  /** Daily AI generation limit for 'viewer' role (typically 0 - no access) */
  VIEWER_DAILY_LIMIT: parseInt(process.env.AI_VIEWER_DAILY_LIMIT || '0', 10),
} as const;

export type AiRateLimitKey = keyof typeof AiRateLimits;

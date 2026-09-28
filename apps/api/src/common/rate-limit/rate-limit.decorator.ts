import { SetMetadata } from '@nestjs/common';
import type { RateLimitRule } from './rate-limit.constants';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Limits for this route, on top of the global one. Each rule counts on its own key, and the
 * request is refused (429) as soon as any of them is exceeded.
 */
export const RateLimit = (
  ...rules: RateLimitRule[]
): ReturnType<typeof SetMetadata> => SetMetadata(RATE_LIMIT_KEY, rules);

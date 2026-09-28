import { RedisService } from '@lib/redis';
import { REDIS_KEY_PREFIXES } from '@lib/redis/redis.constants';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { RateLimitRule } from './rate-limit.constants';

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfterSeconds: number;
}

/**
 * Fixed-window counters in Redis, shared by every API task. A Redis failure lets the request
 * through (logged): an outage must not lock every user out.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  /** Off in most tests (they log in many times); the limiter's own tests turn it on. */
  enabled: boolean;

  constructor(
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    this.enabled = configService.get<boolean>('RATE_LIMIT_ENABLED') ?? true;
  }

  async hit(rule: RateLimitRule, subject: string): Promise<RateLimitDecision> {
    if (!this.enabled) return { allowed: true, retryAfterSeconds: 0 };

    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % rule.windowSeconds);
    const retryAfterSeconds = windowStart + rule.windowSeconds - now;
    // Emails are hashed: keys never hold personal data
    const hashed = createHash('sha256')
      .update(subject)
      .digest('hex')
      .slice(0, 32);
    const key = `${REDIS_KEY_PREFIXES.RATE_LIMIT}${rule.name}:${hashed}:${windowStart}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, rule.windowSeconds + 1);
      return { allowed: count <= rule.limit, retryAfterSeconds };
    } catch (error) {
      this.logger.warn(
        `Rate limiter unavailable, allowing request (${rule.name}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}

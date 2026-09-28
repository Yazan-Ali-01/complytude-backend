import { RedisService } from '@lib/redis';
import { DEFAULT_TTL, REDIS_KEY_PREFIXES } from '@lib/redis/redis.constants';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RateLimitService } from '../../../common/rate-limit/rate-limit.service';

/** Failed logins within DEFAULT_TTL.FAILED_LOGIN (15 min) that lock the account. */
export const MAX_FAILED_LOGINS = 5;
const FIRST_LOCK_SECONDS = 15 * 60;
const MAX_LOCK_SECONDS = 24 * 60 * 60;
/** How long the lock level (and so the doubling) is remembered. */
const LOCK_LEVEL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Per-account lockout against password guessing, independent of the caller's IP: five failed
 * logins for an email in 15 minutes lock it for 15 minutes, doubling on each later lock (up to
 * 24 hours); a successful login clears the count. Unknown emails are counted the same way, so the
 * lock doesn't reveal which accounts exist. Keys hold a hash, never the email.
 */
@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Seconds left on the account's lock, or 0 if it can try to log in. */
  async lockedForSeconds(email: string): Promise<number> {
    if (!this.rateLimit.enabled) return 0;
    try {
      const ttl = await this.redis.ttl(this.key('ACCOUNT_LOCKED', email));
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      this.logger.warn(`Lockout check unavailable: ${String(error)}`);
      return 0;
    }
  }

  async recordFailure(email: string): Promise<void> {
    if (!this.rateLimit.enabled) return;
    try {
      const failuresKey = this.key('FAILED_LOGIN', email);
      const failures = await this.redis.incr(failuresKey);
      if (failures === 1) {
        await this.redis.expire(failuresKey, DEFAULT_TTL.FAILED_LOGIN);
      }
      if (failures < MAX_FAILED_LOGINS) return;

      const levelKey = `${this.key('ACCOUNT_LOCKED', email)}:level`;
      const level = await this.redis.incr(levelKey);
      await this.redis.expire(levelKey, LOCK_LEVEL_TTL_SECONDS);
      const lockSeconds = Math.min(
        FIRST_LOCK_SECONDS * 2 ** (level - 1),
        MAX_LOCK_SECONDS,
      );
      await this.redis.set(
        this.key('ACCOUNT_LOCKED', email),
        true,
        lockSeconds,
      );
      await this.redis.del(failuresKey);
      this.logger.warn(
        `Account locked for ${lockSeconds}s after failed logins`,
      );
    } catch (error) {
      this.logger.warn(`Lockout counter unavailable: ${String(error)}`);
    }
  }

  async recordSuccess(email: string): Promise<void> {
    if (!this.rateLimit.enabled) return;
    await this.redis
      .del(this.key('FAILED_LOGIN', email))
      .catch((error: unknown) =>
        this.logger.warn(`Lockout reset unavailable: ${String(error)}`),
      );
  }

  private key(
    prefix: 'FAILED_LOGIN' | 'ACCOUNT_LOCKED',
    email: string,
  ): string {
    const hashed = createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
    return `${REDIS_KEY_PREFIXES[prefix]}${hashed}`;
  }
}

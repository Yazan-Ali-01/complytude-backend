import type { Logger } from '@nestjs/common';
import type { RedisOptions } from 'ioredis';

/** Longest wait between reconnection attempts. */
export const MAX_RECONNECT_DELAY_MS = 5000;

/**
 * How every Redis client (cache/sessions and BullMQ) survives an outage: it keeps reconnecting,
 * backing off exponentially up to MAX_RECONNECT_DELAY_MS, and never gives up. (A `retryStrategy`
 * that returns anything but a number ends an ioredis client for good, so a failover or a blip
 * longer than the retry budget would stop the app until it restarts.) After an ElastiCache
 * failover the old primary answers READONLY; that reconnects to the new primary and resends.
 */
export function reconnectOptions(
  logger: Logger,
  label: string,
  baseDelayMs = 100,
): Pick<RedisOptions, 'retryStrategy' | 'reconnectOnError'> {
  return {
    retryStrategy: (times: number): number => {
      const delay = Math.min(
        baseDelayMs * 2 ** Math.min(times - 1, 16),
        MAX_RECONNECT_DELAY_MS,
      );
      // Every attempt at first, then once a minute or so while the outage lasts
      if (times <= 5 || times % 12 === 0) {
        logger.warn(
          `${label} connection lost; reconnect attempt ${times} in ${delay}ms`,
        );
      }
      return delay;
    },
    reconnectOnError: (error: Error): boolean | 1 | 2 => {
      if (error.message.startsWith('READONLY')) {
        logger.warn(`${label} is read-only (failover); reconnecting`);
        return 2;
      }
      return false;
    },
  };
}

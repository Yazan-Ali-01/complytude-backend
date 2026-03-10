import { DatabaseService } from '@lib/database';
import Redis from 'ioredis';
import { truncateAllTables, type TruncateOptions } from './truncate.helper';

/**
 * Flushes the current Redis database (FLUSHDB). Clears BullMQ jobs and cache keys.
 * Safe with DB-per-worker isolation — only flushes this worker's Redis DB.
 */
export async function flushRedis(redisClient: Redis): Promise<void> {
  await redisClient.flushdb();
}

/**
 * Resets test state: truncates transactional tables and flushes Redis.
 * Call in beforeEach to isolate test cases.
 */
export async function resetTestState(
  databaseService: DatabaseService,
  redisClient: Redis,
  options?: TruncateOptions,
): Promise<void> {
  await Promise.all([
    truncateAllTables(databaseService, options),
    flushRedis(redisClient),
  ]);
}

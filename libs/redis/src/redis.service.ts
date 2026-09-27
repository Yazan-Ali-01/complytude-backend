import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis, { ChainableCommander } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }

  // ============================================
  // Basic Operations
  // ============================================

  /**
   * Get a value from Redis
   * @param key Redis key
   * @returns Parsed value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a raw string value from Redis without JSON parsing
   * @param key Redis key
   * @returns Raw string value or null if not found
   */
  async getRaw(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Error getting raw key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set a value in Redis
   * @param key Redis key
   * @param value Value to store (will be JSON stringified)
   * @param ttlSeconds Optional TTL in seconds
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds != null) {
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple values from Redis in a single round-trip (MGET).
   * Keys must include the logical prefix (ioredis keyPrefix is applied automatically).
   * @param keys Redis keys
   * @returns Array of parsed values (null for missing keys)
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    try {
      const values = await this.redis.mget(...keys);
      const results: (T | null)[] = [];
      for (const v of values) {
        if (!v) {
          results.push(null);
          continue;
        }
        try {
          results.push(JSON.parse(v) as T);
        } catch {
          results.push(null);
        }
      }
      return results;
    } catch (error) {
      this.logger.error(`Error mget for ${keys.length} keys:`, error);
      throw error;
    }
  }

  /**
   * Delete one or more keys from Redis
   * @param keys Redis keys to delete
   * @returns Number of keys deleted
   */
  async del(...keys: string[]): Promise<number> {
    try {
      return await this.redis.del(...keys);
    } catch (error) {
      this.logger.error(`Error deleting keys ${keys.join(', ')}:`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists
   * @param key Redis key
   * @returns True if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Ping Redis server to check connectivity
   * @returns 'PONG' string response
   */
  async ping(): Promise<string> {
    try {
      return await this.redis.ping();
    } catch (error) {
      this.logger.error('Error pinging Redis server:', error);
      throw error;
    }
  }

  // ============================================
  // Counter Operations
  // ============================================

  /**
   * Increment a counter by 1
   * @param key Redis key
   * @returns New value after increment
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.redis.incr(key);
    } catch (error) {
      this.logger.error(`Error incrementing key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Increment a counter by a specific amount
   * @param key Redis key
   * @param increment Amount to increment by
   * @returns New value after increment
   */
  async incrBy(key: string, increment: number): Promise<number> {
    try {
      return await this.redis.incrby(key, increment);
    } catch (error) {
      this.logger.error(
        `Error incrementing key ${key} by ${increment}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Decrement a counter by 1
   * @param key Redis key
   * @returns New value after decrement
   */
  async decr(key: string): Promise<number> {
    try {
      return await this.redis.decr(key);
    } catch (error) {
      this.logger.error(`Error decrementing key ${key}:`, error);
      throw error;
    }
  }

  // ============================================
  // TTL Management
  // ============================================

  /**
   * Set expiration on a key
   * @param key Redis key
   * @param seconds Expiration time in seconds
   * @returns True if expiration was set
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error setting expiration on key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get remaining TTL for a key
   * @param key Redis key
   * @returns TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      throw error;
    }
  }

  // ============================================
  // Set Operations
  // ============================================

  /**
   * Add members to a set
   * @param key Redis key
   * @param members Members to add
   * @returns Number of members added
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.sadd(key, ...members);
    } catch (error) {
      this.logger.error(`Error adding to set ${key}:`, error);
      throw error;
    }
  }

  /**
   * Remove members from a set
   * @param key Redis key
   * @param members Members to remove
   * @returns Number of members removed
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.srem(key, ...members);
    } catch (error) {
      this.logger.error(`Error removing from set ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all members of a set
   * @param key Redis key
   * @returns Array of members
   */
  async smembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      this.logger.error(`Error getting members of set ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if a member exists in a set
   * @param key Redis key
   * @param member Member to check
   * @returns True if member exists
   */
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.redis.sismember(key, member);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking member in set ${key}:`, error);
      throw error;
    }
  }

  // ============================================
  // Hash Operations
  // ============================================

  /**
   * Set a field in a hash
   * @param key Redis key
   * @param field Hash field
   * @param value Value to set
   */
  async hset(key: string, field: string, value: string): Promise<void> {
    try {
      await this.redis.hset(key, field, value);
    } catch (error) {
      this.logger.error(`Error setting hash field ${field} in ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set multiple fields in a hash
   * @param key Redis key
   * @param data Object with field-value pairs
   */
  async hmset(key: string, data: Record<string, string>): Promise<void> {
    try {
      await this.redis.hset(key, data);
    } catch (error) {
      this.logger.error(`Error setting multiple hash fields in ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a field from a hash
   * @param key Redis key
   * @param field Hash field
   * @returns Field value or null if not found
   */
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.redis.hget(key, field);
    } catch (error) {
      this.logger.error(
        `Error getting hash field ${field} from ${key}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all fields and values from a hash
   * @param key Redis key
   * @returns Object with all fields and values
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.redis.hgetall(key);
    } catch (error) {
      this.logger.error(`Error getting all hash fields from ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete fields from a hash
   * @param key Redis key
   * @param fields Fields to delete
   * @returns Number of fields deleted
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      return await this.redis.hdel(key, ...fields);
    } catch (error) {
      this.logger.error(`Error deleting hash fields from ${key}:`, error);
      throw error;
    }
  }

  // ============================================
  // Scan Operations
  // ============================================

  /**
   * Scan for keys matching a pattern
   * @param pattern Key pattern (e.g., "user:*")
   * @returns Array of matching keys
   * @warning Returned keys include the global keyPrefix configured in ioredis.
   *          Do not pass these keys directly to other RedisService methods without
   *          stripping the prefix, as it will be added again resulting in
   *          double-prefixing (e.g., "complytude:complytude:key").
   */
  async scanKeys(pattern: string): Promise<string[]> {
    try {
      const keys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, matchedKeys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        keys.push(...matchedKeys);
      } while (cursor !== '0');

      return keys;
    } catch (error) {
      this.logger.error(`Error scanning keys with pattern ${pattern}:`, error);
      throw error;
    }
  }

  // ============================================
  // Pipeline Operations
  // ============================================

  /**
   * Get a Redis pipeline for batch operations
   * @returns Redis pipeline
   */
  pipeline(): ChainableCommander {
    return this.redis.pipeline();
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get the underlying Redis client (use with caution)
   * @returns Redis client instance
   */
  getClient(): Redis {
    return this.redis;
  }
}

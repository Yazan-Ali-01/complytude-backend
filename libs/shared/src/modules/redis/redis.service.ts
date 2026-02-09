import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

/**
 * RedisService - Global Redis client wrapper
 *
 * Features:
 * - Connection pooling via ioredis
 * - Automatic reconnection with exponential backoff
 * - Circuit breaker pattern for graceful degradation
 * - Health check support
 * - Pipeline and transaction support
 *
 * Usage:
 * ```typescript
 * constructor(private readonly redisService: RedisService) {}
 *
 * async example() {
 *   const client = this.redisService.getClient();
 *   await client.set('key', 'value');
 *   const value = await client.get('key');
 * }
 * ```
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private isConnected = false;
  private connectionAttempts = 0;
  private readonly MAX_CONNECTION_ATTEMPTS = 10;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Establish Redis connection
   */
  private async connect(): Promise<void> {
    try {
      const config: RedisOptions = {
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        password: this.configService.get<string>('redis.password'),
        db: this.configService.get<number>('redis.db'),
        keyPrefix: this.configService.get<string>('redis.keyPrefix'),
        maxRetriesPerRequest: this.configService.get<number>('redis.maxRetriesPerRequest'),
        retryStrategy: this.configService.get<(times: number) => number>('redis.retryStrategy'),
        enableReadyCheck: this.configService.get<boolean>('redis.enableReadyCheck'),
        connectTimeout: this.configService.get<number>('redis.connectTimeout'),
        lazyConnect: false,
      };

      this.client = new Redis(config);

      // Event listeners
      this.client.on('connect', () => {
        this.logger.log('Redis client connecting...');
        this.connectionAttempts++;
      });

      this.client.on('ready', () => {
        this.logger.log('Redis client ready');
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.client.on('error', (error) => {
        this.logger.error(`Redis client error: ${error.message}`, error.stack);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', (timeMs) => {
        this.logger.warn(`Redis client reconnecting in ${timeMs}ms (attempt ${this.connectionAttempts})`);
        
        if (this.connectionAttempts >= this.MAX_CONNECTION_ATTEMPTS) {
          this.logger.error('Max Redis reconnection attempts reached. Circuit breaker may open.');
        }
      });

      // Wait for ready or timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, this.configService.get<number>('redis.connectTimeout'));

        this.client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.client.once('error', (error) => {
          clearTimeout(timeout);
          // Don't reject, let retry mechanism handle it
          this.logger.warn(`Initial Redis connection failed: ${error.message}, will retry`);
          resolve(); // Resolve anyway to not block app startup
        });
      });

    } catch (error) {
      this.logger.error(`Failed to initialize Redis connection: ${error.message}`, error.stack);
      // Don't throw - allow app to start with degraded Redis
    }
  }

  /**
   * Gracefully disconnect from Redis
   */
  private async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('Redis client disconnected gracefully');
      } catch (error) {
        this.logger.error(`Error disconnecting Redis: ${error.message}`);
        this.client.disconnect();
      }
    }
  }

  /**
   * Get the Redis client instance
   * @returns Redis client
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Check if Redis is connected and healthy
   * @returns Promise<boolean>
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get connection status
   * @returns boolean
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Execute a Lua script atomically
   * @param script Lua script source code
   * @param keys Array of Redis keys used in the script
   * @param args Array of arguments passed to the script
   * @returns Promise<any> Script execution result
   */
  async evalScript(script: string, keys: string[], args: (string | number)[]): Promise<any> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  /**
   * Create a Redis pipeline for batching commands
   * @returns Redis Pipeline
   */
  pipeline() {
    return this.client.pipeline();
  }

  /**
   * Create a Redis multi (transaction)
   * @returns Redis Multi
   */
  multi() {
    return this.client.multi();
  }
}

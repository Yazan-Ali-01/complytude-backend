import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import redisConfig from './redis.config';
import { RedisService } from './redis.service';

/**
 * RedisModule - Global module for Redis client
 *
 * Marked as @Global() so it's available across all modules
 * without explicit import. Import once in AppModule.
 *
 * Features:
 * - ioredis client with connection pooling
 * - Automatic reconnection with exponential backoff
 * - Circuit breaker for graceful degradation
 * - Health check support
 *
 * Usage in AppModule:
 * ```typescript
 * @Module({
 *   imports: [RedisModule, ...],
 * })
 * export class AppModule {}
 * ```
 *
 * Usage in any service:
 * ```typescript
 * constructor(private readonly redisService: RedisService) {}
 * ```
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

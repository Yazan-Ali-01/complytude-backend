import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig } from './interfaces/redis-config.interface';
import { REDIS_CLIENT } from './redis.constants';
import { RedisHealthIndicator } from './redis.health';
import { RedisService } from './redis.service';

@Global()
@Module({})
export class RedisModule {
  private static readonly logger = new Logger(RedisModule.name);

  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS_CLIENT,
          useFactory: (configService: ConfigService) => {
            const config = configService.get<RedisConfig>('redis');

            if (!config) {
              throw new Error('Redis configuration not found');
            }

            const client = new Redis({
              host: config.host,
              port: config.port,
              password: config.password,
              db: config.db,
              tls: config.tls,
              keyPrefix: config.keyPrefix,
              maxRetriesPerRequest: config.maxRetriesPerRequest,
              connectTimeout: config.connectTimeout,
              retryStrategy: (times) => {
                if (times > 3) {
                  RedisModule.logger.error(
                    '❌ Redis connection failed after 3 retries',
                  );
                  return null; // Stop retrying
                }
                const delay = Math.min(times * config.retryDelayMs, 2000);
                RedisModule.logger.warn(
                  `Redis connection attempt ${times}, retrying in ${delay}ms...`,
                );
                return delay;
              },
            });

            // Connection event handlers
            client.on('connect', () => {
              RedisModule.logger.log(
                '✅ Redis connection established successfully',
              );
            });

            client.on('ready', () => {
              RedisModule.logger.log(
                'Redis client is ready to accept commands',
              );
            });

            client.on('error', (error) => {
              RedisModule.logger.error('Redis client error:', error);
            });

            client.on('close', () => {
              RedisModule.logger.warn('Redis connection closed');
            });

            client.on('reconnecting', () => {
              RedisModule.logger.log('Redis client reconnecting...');
            });

            return client;
          },
          inject: [ConfigService],
        },
        RedisService,
        RedisHealthIndicator,
      ],
      exports: [RedisService, RedisHealthIndicator],
    };
  }
}

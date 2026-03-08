import { Injectable, Logger } from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
import { CommonI18n } from '../../../apps/api/src/common/constants';
import { RedisService } from './redis.service';

export interface RedisHealthResult {
  status: string;
  redis: string;
  timestamp?: Date;
  latency?: number;
  error?: string;
}

@Injectable()
export class RedisHealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(
    private readonly redisService: RedisService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  /**
   * Check Redis health by performing a ping operation
   * @returns Health check result
   */
  async isHealthy(): Promise<RedisHealthResult> {
    const start = Date.now();

    try {
      // Perform ping test
      const result = await this.redisService.ping();
      const latency = Date.now() - start;

      if (result === 'PONG') {
        return {
          status: 'ok',
          redis: 'connected',
          timestamp: new Date(),
          latency,
        };
      }

      throw new Error(
        // RedisHealthIndicatorI18n is required but in phase 2 (RedisHealthIndicatorI18n.errors.REDIS_PING_FAILED)
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
          'Redis ping failed - unexpected response',
      );
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        status: 'error',
        redis: 'disconnected',
        error: errorMessage,
      };
    }
  }
}

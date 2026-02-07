import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check Redis health by performing a ping operation
   * @returns Health check result
   */
  async isHealthy(): Promise<RedisHealthResult> {
    const start = Date.now();

    try {
      // Perform ping test
      await this.redisService.set('health:ping', 'pong', 10);
      const result = await this.redisService.get<string>('health:ping');

      const latency = Date.now() - start;

      if (result === 'pong') {
        return {
          status: 'ok',
          redis: 'connected',
          timestamp: new Date(),
          latency,
        };
      }

      throw new Error('Redis ping failed - unexpected response');
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

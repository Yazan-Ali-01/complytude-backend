import { RedisHealthIndicator } from '@complytude/shared/redis/redis.health';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

export interface HealthCheckResult {
  status: string;
  timestamp: string;
  uptime: number;
}

export interface DatabaseHealthResult {
  status: string;
  database: string;
  timestamp?: Date;
  error?: string;
}

export interface RedisHealthResult {
  status: string;
  redis: string;
  timestamp?: Date;
  latency?: number;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisHealthIndicator: RedisHealthIndicator,
  ) {}

  check(): HealthCheckResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  async checkDatabase(): Promise<DatabaseHealthResult> {
    try {
      const result = await this.databaseService.query<{ time: Date }>(
        'SELECT NOW() as time',
      );
      return {
        status: 'ok',
        database: 'connected',
        timestamp: result.rows[0].time,
      };
    } catch (error) {
      this.logger.error('Database health check failed', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'error',
        database: 'disconnected',
        error: errorMessage,
      };
    }
  }

  async checkRedis(): Promise<RedisHealthResult> {
    return await this.redisHealthIndicator.isHealthy();
  }
}

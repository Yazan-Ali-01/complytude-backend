import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@complytude/shared/redis/redis.service';
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
  connected: boolean;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
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

  /**
   * Check Redis connection and health
   * @returns RedisHealthResult
   */
  async checkRedis(): Promise<RedisHealthResult> {
    try {
      const isHealthy = await this.redisService.isHealthy();
      const isConnected = this.redisService.isClientConnected();

      if (isHealthy && isConnected) {
        return {
          status: 'ok',
          redis: 'connected',
          connected: true,
        };
      }

      return {
        status: 'degraded',
        redis: 'disconnected',
        connected: false,
        error: 'Redis client not connected or unhealthy',
      };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'error',
        redis: 'disconnected',
        connected: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Comprehensive health check (all dependencies)
   * @returns Combined health status
   */
  async checkAll(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    database: DatabaseHealthResult;
    redis: RedisHealthResult;
  }> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    // Overall status: error if any critical service is down
    let overallStatus = 'ok';
    if (database.status === 'error') {
      overallStatus = 'error'; // Database down = critical
    } else if (redis.status === 'error' || redis.status === 'degraded') {
      overallStatus = 'degraded'; // Redis down = degraded (auth still works)
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database,
      redis,
    };
  }
}

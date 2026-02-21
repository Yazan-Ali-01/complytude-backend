import { RedisHealthIndicator } from '@lib/redis/redis.health';
import { QUEUE_NAMES } from '@lib/queue';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
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

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisHealthIndicator: RedisHealthIndicator,
    @InjectQueue(QUEUE_NAMES.AI_PROCESSING) private readonly aiQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DATA_INGESTION)
    private readonly ingestionQueue: Queue,
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

  async checkRedis() {
    return await this.redisHealthIndicator.isHealthy();
  }

  async checkQueues() {
    const queues = [
      { name: QUEUE_NAMES.AI_PROCESSING, queue: this.aiQueue },
      { name: QUEUE_NAMES.DATA_INGESTION, queue: this.ingestionQueue },
    ];

    const results = await Promise.all(
      queues.map(async ({ name, queue }) => {
        try {
          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
              queue.getWaitingCount(),
              queue.getActiveCount(),
              queue.getCompletedCount(),
              queue.getFailedCount(),
              queue.getDelayedCount(),
            ]);

          return {
            name,
            status: 'healthy' as const,
            counts: { waiting, active, completed, failed, delayed },
          };
        } catch {
          return {
            name,
            status: 'unhealthy' as const,
            error: 'Connection failed',
          };
        }
      }),
    );

    const allHealthy = results.every((r) => r.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      queues: results,
    };
  }
}

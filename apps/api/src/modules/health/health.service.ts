import { DatabaseService } from '@lib/database';
import { QUEUE_NAMES } from '@lib/queue';
import { RedisHealthIndicator } from '@lib/redis/redis.health';
// eslint-disable-next-line no-restricted-imports
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line no-restricted-imports
import { Queue } from 'bullmq';

export interface HealthCheckResult {
  status: string;
  timestamp: string;
  uptime: number;
}

export type DependencyState = 'up' | 'down';

export interface ReadinessResult {
  status: 'ok' | 'unavailable';
  checks: {
    database: DependencyState;
    redis: DependencyState;
    queues: DependencyState;
  };
}

/** Longest a readiness probe waits for one dependency. */
const CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisHealthIndicator: RedisHealthIndicator,
    // Any queue: they share one BullMQ Redis connection setup
    @InjectQueue(QUEUE_NAMES.TENANT_PROCESSING) private readonly queue: Queue,
  ) {}

  /** Liveness: the process answers. Used by the ECS container check, so it never restarts tasks over a dependency outage. */
  check(): HealthCheckResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Readiness: the database, Redis and the queue connection all answer within 2 s. Used by the
   * load balancer and the uptime check. Reports only up/down: failures are logged, never returned.
   */
  async checkReadiness(): Promise<ReadinessResult> {
    const [database, redis, queues] = await Promise.all([
      this.probe('database', async () => {
        await this.databaseService.query('SELECT 1');
      }),
      this.probe('redis', async () => {
        const result = await this.redisHealthIndicator.isHealthy();
        if (result.status !== 'ok') throw new Error('Redis ping failed');
      }),
      this.probe('queues', async () => {
        const client = await this.queue.client;
        if ((await client.ping()) !== 'PONG') {
          throw new Error('BullMQ Redis ping failed');
        }
      }),
    ]);
    const checks = { database, redis, queues };
    return {
      status: Object.values(checks).every((state) => state === 'up')
        ? 'ok'
        : 'unavailable',
      checks,
    };
  }

  private async probe(
    name: string,
    check: () => Promise<void>,
  ): Promise<DependencyState> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        check(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)),
            CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return 'up';
    } catch (error) {
      this.logger.error(
        `Readiness: ${name} is down: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}

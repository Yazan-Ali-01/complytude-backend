import { QUEUE_NAMES, TENANT_JOB_NAMES } from '@lib/queue';
// eslint-disable-next-line no-restricted-imports
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// eslint-disable-next-line no-restricted-imports
import { Queue } from 'bullmq';

/**
 * Registers the repeatable maintenance jobs (re-registered on boot): the stuck-work sweep every
 * 5 minutes, the queue metrics every minute and the data retention sweep daily.
 */
@Injectable()
export class StuckWorkSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(StuckWorkSchedulerService.name);

  static readonly CRON_PATTERN = '*/5 * * * *';
  /** Every minute: the window QueueMetricsHandler counts recent failures over. */
  static readonly QUEUE_METRICS_PATTERN = '* * * * *';
  /** Daily at 03:15 UTC. */
  static readonly DATA_RETENTION_PATTERN = '15 3 * * *';

  constructor(
    @InjectQueue(QUEUE_NAMES.TENANT_PROCESSING)
    private readonly tenantQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.tenantQueue.upsertJobScheduler(
        TENANT_JOB_NAMES.STUCK_WORK_SWEEP,
        { pattern: StuckWorkSchedulerService.CRON_PATTERN },
        {
          name: TENANT_JOB_NAMES.STUCK_WORK_SWEEP,
          data: { triggeredAt: new Date().toISOString() },
        },
      );
      this.logger.log(
        `Stuck-work sweep scheduled (cron="${StuckWorkSchedulerService.CRON_PATTERN}")`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule the stuck-work sweep: ${(error as Error).message}`,
      );
    }
    try {
      await this.tenantQueue.upsertJobScheduler(
        TENANT_JOB_NAMES.QUEUE_METRICS,
        { pattern: StuckWorkSchedulerService.QUEUE_METRICS_PATTERN },
        {
          name: TENANT_JOB_NAMES.QUEUE_METRICS,
          data: { triggeredAt: new Date().toISOString() },
          // Metrics of a missed minute are worthless: never retry, keep little history
          opts: { attempts: 1, removeOnComplete: 10, removeOnFail: 10 },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule queue metrics: ${(error as Error).message}`,
      );
    }
    try {
      await this.tenantQueue.upsertJobScheduler(
        TENANT_JOB_NAMES.DATA_RETENTION_SWEEP,
        { pattern: StuckWorkSchedulerService.DATA_RETENTION_PATTERN },
        {
          name: TENANT_JOB_NAMES.DATA_RETENTION_SWEEP,
          data: { triggeredAt: new Date().toISOString() },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule the data retention sweep: ${(error as Error).message}`,
      );
    }
  }
}

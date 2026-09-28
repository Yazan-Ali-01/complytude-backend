import { QUEUE_NAMES, TENANT_JOB_NAMES } from '@lib/queue';
// eslint-disable-next-line no-restricted-imports
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// eslint-disable-next-line no-restricted-imports
import { Queue } from 'bullmq';

/** Registers the stuck-work sweep every 5 minutes (re-registered on boot). */
@Injectable()
export class StuckWorkSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(StuckWorkSchedulerService.name);

  static readonly CRON_PATTERN = '*/5 * * * *';

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
  }
}

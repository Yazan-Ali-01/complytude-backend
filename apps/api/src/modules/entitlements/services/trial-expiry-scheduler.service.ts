import { ENTITLEMENT_JOB_NAMES, QUEUE_NAMES } from '@lib/queue';
// eslint-disable-next-line no-restricted-imports
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// eslint-disable-next-line no-restricted-imports
import { Queue } from 'bullmq';

/**
 * Schedules the trial expiry check job to run every 6 hours.
 * Uses BullMQ repeatable job - configured on app startup.
 */
@Injectable()
export class TrialExpirySchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TrialExpirySchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ENTITLEMENT_PROCESSING)
    private readonly entitlementQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const repeatableJobs = await this.entitlementQueue.getRepeatableJobs();
      const existing = repeatableJobs.find(
        (j) =>
          j.name === ENTITLEMENT_JOB_NAMES.TRIAL_EXPIRY_CHECK &&
          j.pattern === '0 */6 * * *',
      );
      if (existing) {
        await this.entitlementQueue.removeRepeatableByKey(existing.key);
        this.logger.log('Removed existing trial expiry repeatable job');
      }

      await this.entitlementQueue.add(
        ENTITLEMENT_JOB_NAMES.TRIAL_EXPIRY_CHECK,
        { triggeredAt: new Date().toISOString() },
        {
          repeat: {
            pattern: '0 */6 * * *',
          },
        },
      );
      this.logger.log(
        'Trial expiry check repeatable job registered (every 6 hours)',
      );
    } catch (error) {
      this.logger.error(
        `Failed to register trial expiry repeatable job: ${(error as Error).message}`,
      );
    }
  }
}

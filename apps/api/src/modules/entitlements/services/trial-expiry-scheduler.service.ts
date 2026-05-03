import { ENTITLEMENT_JOB_NAMES, QUEUE_NAMES } from '@lib/queue';
// eslint-disable-next-line no-restricted-imports
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// eslint-disable-next-line no-restricted-imports
import { Queue } from 'bullmq';

/**
 * Schedules trial-related repeatable cron jobs on the ENTITLEMENT_PROCESSING
 * queue:
 *
 * - `TRIAL_EXPIRY_CHECK`: downgrades trials whose `trial_ends_at` has passed.
 * - `TRIAL_REMINDER_CHECK`: sends a "trial ending soon" email ~3 days before
 *   expiry. The handler uses a wide 2–4 day window + a `trial_reminder_sent_at`
 *   flag, so a missed tick still picks up the row on the next run without
 *   double-sending.
 *
 * Both run every 6 hours. Existing repeatable jobs with the same name are
 * pruned and re-registered on boot to keep the schedule authoritative.
 */
@Injectable()
export class TrialExpirySchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TrialExpirySchedulerService.name);

  private static readonly CRON_PATTERN = '0 */6 * * *';

  constructor(
    @InjectQueue(QUEUE_NAMES.ENTITLEMENT_PROCESSING)
    private readonly entitlementQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerRepeatable(
      ENTITLEMENT_JOB_NAMES.TRIAL_EXPIRY_CHECK,
      'Trial expiry check',
    );
    await this.registerRepeatable(
      ENTITLEMENT_JOB_NAMES.TRIAL_REMINDER_CHECK,
      'Trial reminder check',
    );
  }

  private async registerRepeatable(
    jobName: string,
    description: string,
  ): Promise<void> {
    try {
      const repeatableJobs = await this.entitlementQueue.getRepeatableJobs();
      const existingJobs = repeatableJobs.filter((j) => j.name === jobName);
      for (const j of existingJobs) {
        await this.entitlementQueue.removeRepeatableByKey(j.key);
      }
      if (existingJobs.length > 0) {
        this.logger.log(
          `Removed ${existingJobs.length} existing "${jobName}" repeatable job(s)`,
        );
      }

      await this.entitlementQueue.add(
        jobName,
        { triggeredAt: new Date().toISOString() },
        {
          repeat: {
            pattern: TrialExpirySchedulerService.CRON_PATTERN,
          },
        },
      );
      this.logger.log(
        `${description} repeatable job registered (cron="${TrialExpirySchedulerService.CRON_PATTERN}")`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to register ${jobName} repeatable job: ${(error as Error).message}`,
      );
    }
  }
}

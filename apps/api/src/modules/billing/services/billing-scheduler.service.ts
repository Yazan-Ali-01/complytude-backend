import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BILLING_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';

/**
 * Billing Scheduler Service
 *
 * Sets up recurring BullMQ jobs for billing operations:
 * - Daily Stripe reconciliation at 3 AM
 *
 * Jobs are scheduled once on application startup and persist in Redis.
 * Idempotent - safe to restart the application.
 */
@Injectable()
export class BillingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BillingSchedulerService.name);

  constructor(
    private readonly queueProducer: QueueProducerService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Only schedule jobs in production or when explicitly enabled
    const shouldSchedule = this.shouldScheduleJobs();
    if (!shouldSchedule) {
      this.logger.log('Billing job scheduling disabled');
      return;
    }

    await this.scheduleReconciliationJob();
  }

  /**
   * Schedule daily Stripe reconciliation at 3 AM
   */
  private async scheduleReconciliationJob(): Promise<void> {
    try {
      await this.queueProducer.enqueue(
        QUEUE_NAMES.BILLING_PROCESSING,
        BILLING_JOB_NAMES.STRIPE_RECONCILIATION,
        {
          reason: 'scheduled',
        },
        {
          // Run daily at 3 AM
          repeat: {
            pattern: '0 3 * * *', // cron: minute hour day month dayOfWeek
          },
          // Job options
          removeOnComplete: 10, // Keep last 10 successful jobs
          removeOnFail: 50, // Keep last 50 failed jobs for debugging
          attempts: 3, // Retry up to 3 times
          backoff: {
            type: 'exponential',
            delay: 60000, // Start with 1 minute delay
          },
        },
      );

      this.logger.log('Scheduled daily Stripe reconciliation job (3 AM)');
    } catch (error) {
      this.logger.error(
        'Failed to schedule Stripe reconciliation job',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Determine if jobs should be scheduled based on environment
   */
  private shouldScheduleJobs(): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const forceSchedule = this.configService.get<string>(
      'BILLING_SCHEDULE_ENABLED',
      'false',
    );

    // Schedule in production by default, or when explicitly enabled
    return nodeEnv === 'production' || forceSchedule.toLowerCase() === 'true';
  }
}

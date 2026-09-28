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
 * - Stripe webhook re-drive every 5 minutes
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
    await this.scheduleWebhookRedriveJob();
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
   * Re-drive failed and stranded Stripe webhook events every 5 minutes. Each event's own backoff
   * decides whether a run retries it.
   */
  private async scheduleWebhookRedriveJob(): Promise<void> {
    await this.queueProducer.enqueue(
      QUEUE_NAMES.BILLING_PROCESSING,
      BILLING_JOB_NAMES.STRIPE_WEBHOOK_REDRIVE,
      {},
      {
        repeat: { pattern: '*/5 * * * *' },
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );

    this.logger.log('Scheduled Stripe webhook re-drive job (every 5 minutes)');
  }

  /**
   * Determine if jobs should be scheduled based on environment
   */
  private shouldScheduleJobs(): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const forceSchedule = this.configService.get<boolean>(
      'BILLING_SCHEDULE_ENABLED',
      false,
    );

    return nodeEnv === 'production' || forceSchedule === true;
  }
}

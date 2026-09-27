import { EntitlementCreditNotificationJobData, Job } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Credit Notification Handler
 *
 * Handles CREDIT_NOTIFICATION jobs for async credit event processing.
 * Sends email receipts, low balance alerts, etc.
 *
 * Current: Logs event. Future: send transactional emails.
 */
@Injectable()
export class CreditNotificationHandler {
  private readonly logger = new Logger(CreditNotificationHandler.name);

  execute(job: Job<EntitlementCreditNotificationJobData>): Promise<void> {
    const { tenantId, transactionType, amount, remainingBalance } = job.data;

    this.logger.debug(
      `Credit notification: tenant=${tenantId} type=${transactionType} amount=${amount} balance=${remainingBalance}`,
    );

    // TODO: Send transactional emails
    // - purchased → receipt
    // - granted → confirmation
    // - deducted → low balance alert when below threshold
    // - refunded → confirmation
    return Promise.resolve();
  }
}

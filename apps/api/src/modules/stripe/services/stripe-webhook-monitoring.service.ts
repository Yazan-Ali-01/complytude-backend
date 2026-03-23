import { Injectable, Logger } from '@nestjs/common';
import { StripeWebhookEvent } from 'src/common/types/stripe.types';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import { StripeWebhookService } from '../webhook/stripe-webhook.service';

export interface WebhookStats {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  failed: StripeWebhookEvent[];
  avg_processing_time_ms: number;
}

export interface RetryResult {
  attempted: number;
  retried: number;
  failed: number;
}

@Injectable()
export class StripeWebhookMonitoringService {
  private readonly logger = new Logger(StripeWebhookMonitoringService.name);

  constructor(
    private readonly webhookEventsRepository: StripeWebhookEventsRepository,
    private readonly webhookService: StripeWebhookService,
  ) {}

  /**
   * Aggregate webhook processing stats for the last `hours` hours.
   * Useful for admin dashboards and health checks.
   */
  async getWebhookStats(hours: number = 24): Promise<WebhookStats> {
    const [total, by_status, by_type, failed, avg_processing_time_ms] =
      await Promise.all([
        this.webhookEventsRepository.countEvents(hours),
        this.webhookEventsRepository.countByStatus(hours),
        this.webhookEventsRepository.countByType(hours),
        this.webhookEventsRepository.getFailedEvents(hours),
        this.webhookEventsRepository.avgProcessingTimeMs(hours),
      ]);

    return { total, by_status, by_type, failed, avg_processing_time_ms };
  }

  /**
   * Retry failed webhook events that haven't exceeded `maxRetries`.
   *
   * Note: retries go through `processEvent`, which increments the `attempts`
   * counter via upsert. `findRetryableEvents` filters WHERE attempts < maxRetries
   * to prevent infinite retry loops.
   */
  async retryFailedEvents(maxRetries: number = 3): Promise<RetryResult> {
    const events =
      await this.webhookEventsRepository.findRetryableEvents(maxRetries);

    const result: RetryResult = {
      attempted: events.length,
      retried: 0,
      failed: 0,
    };

    for (const event of events) {
      try {
        // event.data is already a parsed Stripe.Event (JSONB → object)
        await this.webhookService.processEvent(event.data);
        result.retried++;
        this.logger.log(
          `Retry succeeded for stripe_event_id=${event.stripeEventId} (attempt ${event.attempts + 1})`,
        );
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Retry failed for stripe_event_id=${event.stripeEventId}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Retry run complete: attempted=${result.attempted} retried=${result.retried} failed=${result.failed}`,
    );

    return result;
  }
}

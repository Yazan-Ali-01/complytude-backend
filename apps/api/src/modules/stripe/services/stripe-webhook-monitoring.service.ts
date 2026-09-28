import { Injectable, Logger } from '@nestjs/common';
import { StripeWebhookEvent } from 'src/common/types/stripe.types';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import {
  WEBHOOK_STALE_PENDING_MS,
  WEBHOOK_STALE_PROCESSING_MS,
} from '../stripe.constants';
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

export interface RedriveResult extends RetryResult {
  /** Events still failed after this run (whether or not they were due). */
  stillFailing: number;
  /** Failed events out of automatic retries; they need a manual retry. */
  exhausted: number;
}

/** Most events one scheduled re-drive run processes. */
const REDRIVE_BATCH_SIZE = 100;

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
   * Manually retry failed webhook events now, whatever their re-drive schedule, including events
   * out of automatic retries. With `maxRetries`, events that already had that many processing
   * attempts are skipped.
   */
  async retryFailedEvents(maxRetries?: number): Promise<RetryResult> {
    const events =
      await this.webhookEventsRepository.findRetryableEvents(maxRetries);
    const result = await this.process(events, new Date());

    this.logger.log(
      `Retry run complete: attempted=${result.attempted} retried=${result.retried} failed=${result.failed}`,
    );

    return result;
  }

  /**
   * Scheduled re-drive: processes failed events whose backoff has elapsed, pending events whose
   * queue job was lost, and processing claims left by a crashed worker. Logs an error while any
   * event is failed, so an alarm on that log line catches events the re-drive can't fix.
   */
  async redriveDueEvents(now: Date = new Date()): Promise<RedriveResult> {
    const events = await this.webhookEventsRepository.findDueForRedrive(
      now,
      new Date(now.getTime() - WEBHOOK_STALE_PENDING_MS),
      new Date(now.getTime() - WEBHOOK_STALE_PROCESSING_MS),
      REDRIVE_BATCH_SIZE,
    );
    const result = await this.process(events, now);
    const { failed: stillFailing, exhausted } =
      await this.webhookEventsRepository.countFailing();

    if (stillFailing > 0) {
      this.logger.error(
        `Stripe webhook events failing: failed=${stillFailing} exhausted=${exhausted} ` +
          `(re-drive run: attempted=${result.attempted} retried=${result.retried}). ` +
          'Exhausted events need POST /admin/stripe/retry-failed-webhooks after the cause is fixed.',
      );
    } else if (result.attempted > 0) {
      this.logger.log(
        `Webhook re-drive complete: attempted=${result.attempted} retried=${result.retried}`,
      );
    }

    return { ...result, stillFailing, exhausted };
  }

  private async process(
    events: StripeWebhookEvent[],
    now: Date,
  ): Promise<RetryResult> {
    const result: RetryResult = {
      attempted: events.length,
      retried: 0,
      failed: 0,
    };

    for (const event of events) {
      try {
        // event.data is already a parsed Stripe.Event (JSONB → object)
        await this.webhookService.processEvent(event.data, now);
        result.retried++;
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Re-drive failed for stripe_event_id=${event.stripeEventId}: ${message}`,
        );
      }
    }

    return result;
  }
}

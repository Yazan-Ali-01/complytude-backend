import { BaseRepository, DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  StripeWebhookEvent,
  StripeWebhookProcessingStatus,
  WEBHOOK_PROCESSING_STATUS,
} from 'src/common/types/stripe.types';

export type { StripeWebhookEvent };

type StripeWebhookEventRow = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  stripe_api_version: string | null;
  data: unknown;
  processing_status: StripeWebhookProcessingStatus;
  processing_error: string | null;
  attempts: number;
  deliveries: number;
  processing_started_at: Date | null;
  next_retry_at: Date | null;
  processed_at: Date | null;
  created_at: Date;
};

type CreateStripeWebhookEventRow = {
  stripe_event_id: string;
  event_type: string;
  stripe_api_version: string | null;
  data: string;
  processing_status: StripeWebhookProcessingStatus;
};

@Injectable()
export class StripeWebhookEventsRepository extends BaseRepository<
  StripeWebhookEvent,
  CreateStripeWebhookEventRow,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.stripe_webhook_events');
  }

  protected getSelectColumns(): string {
    return 'id, stripe_event_id, event_type, stripe_api_version, data, processing_status, processing_error, attempts, deliveries, processing_started_at, next_retry_at, processed_at, created_at';
  }

  protected mapRow(row: Record<string, unknown>): StripeWebhookEvent {
    const r = row as StripeWebhookEventRow;
    return {
      id: r.id,
      stripeEventId: r.stripe_event_id,
      eventType: r.event_type,
      stripeApiVersion: r.stripe_api_version,
      data: r.data as Stripe.Event,
      processingStatus: r.processing_status,
      processingError: r.processing_error,
      attempts: r.attempts,
      deliveries: r.deliveries,
      processingStartedAt: r.processing_started_at,
      nextRetryAt: r.next_retry_at,
      processedAt: r.processed_at,
      createdAt: r.created_at,
    };
  }

  async findByStripeEventId(
    stripeEventId: string,
  ): Promise<StripeWebhookEvent | null> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE stripe_event_id = $1`,
      [stripeEventId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Records a delivery from Stripe: stores a new event as pending, or counts another delivery of a
   * known one without touching its processing state. Returns the stored event.
   */
  async recordDelivery(event: Stripe.Event): Promise<StripeWebhookEvent> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `INSERT INTO ${this.tableName} (stripe_event_id, event_type, stripe_api_version, data, processing_status, attempts, deliveries)
       VALUES ($1, $2, $3, $4, $5, 0, 1)
       ON CONFLICT (stripe_event_id) DO UPDATE
         SET deliveries = ${this.tableName}.deliveries + 1
       RETURNING ${this.getSelectColumns()}`,
      [
        event.id,
        event.type,
        event.api_version ?? null,
        JSON.stringify(event),
        WEBHOOK_PROCESSING_STATUS.PENDING,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  /** Stores an event that reaches processing without a delivery (e.g. a manual replay). */
  async ensureStored(event: Stripe.Event): Promise<void> {
    await this.executeQuery(
      `INSERT INTO ${this.tableName} (stripe_event_id, event_type, stripe_api_version, data, processing_status, attempts, deliveries)
       VALUES ($1, $2, $3, $4, $5, 0, 0)
       ON CONFLICT (stripe_event_id) DO NOTHING`,
      [
        event.id,
        event.type,
        event.api_version ?? null,
        JSON.stringify(event),
        WEBHOOK_PROCESSING_STATUS.PENDING,
      ],
    );
  }

  /**
   * Atomically claims an event for processing: pending and failed events, and processing claims
   * older than `staleBefore` (a crashed worker). Returns null when another worker holds it or it
   * has completed.
   */
  async claim(
    stripeEventId: string,
    staleBefore: Date,
  ): Promise<StripeWebhookEvent | null> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `UPDATE ${this.tableName}
       SET processing_status = $2, attempts = attempts + 1, processing_started_at = NOW()
       WHERE stripe_event_id = $1
         AND (processing_status IN ($3, $4)
              OR (processing_status = $2 AND processing_started_at < $5))
       RETURNING ${this.getSelectColumns()}`,
      [
        stripeEventId,
        WEBHOOK_PROCESSING_STATUS.PROCESSING,
        WEBHOOK_PROCESSING_STATUS.PENDING,
        WEBHOOK_PROCESSING_STATUS.FAILED,
        staleBefore,
      ],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async markCompleted(stripeEventId: string): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName}
       SET processing_status = $2, processing_error = NULL, next_retry_at = NULL, processed_at = NOW()
       WHERE stripe_event_id = $1`,
      [stripeEventId, WEBHOOK_PROCESSING_STATUS.COMPLETED],
    );
  }

  /** Marks a failed attempt; `nextRetryAt` null means the event is out of automatic retries. */
  async markFailed(
    stripeEventId: string,
    error: string,
    nextRetryAt: Date | null,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName}
       SET processing_status = $2, processing_error = $3, next_retry_at = $4, processed_at = NOW()
       WHERE stripe_event_id = $1`,
      [stripeEventId, WEBHOOK_PROCESSING_STATUS.FAILED, error, nextRetryAt],
    );
  }

  /**
   * Events the scheduled re-drive should process now: failed events that are due, pending events
   * whose queue job was lost, and processing claims left by a crashed worker. Oldest first.
   */
  async findDueForRedrive(
    now: Date,
    stalePendingBefore: Date,
    staleProcessingBefore: Date,
    limit: number,
  ): Promise<StripeWebhookEvent[]> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE (processing_status = 'failed' AND next_retry_at <= $1)
          OR (processing_status = 'pending' AND created_at < $2)
          OR (processing_status = 'processing' AND processing_started_at < $3)
       ORDER BY created_at ASC
       LIMIT $4`,
      [now, stalePendingBefore, staleProcessingBefore, limit],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** Failed events, and how many of them are out of automatic retries. */
  async countFailing(): Promise<{ failed: number; exhausted: number }> {
    const result = await this.executeQuery<{
      failed: string;
      exhausted: string;
    }>(
      `SELECT COUNT(*) AS failed, COUNT(*) FILTER (WHERE next_retry_at IS NULL) AS exhausted
       FROM ${this.tableName}
       WHERE processing_status = 'failed'`,
    );
    return {
      failed: parseInt(result.rows[0].failed, 10),
      exhausted: parseInt(result.rows[0].exhausted, 10),
    };
  }

  // ─── Monitoring methods ────────────────────────────────────────────────────

  /** Total event count within the last `hours` hours. */
  async countEvents(hours: number): Promise<number> {
    const result = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.tableName}
       WHERE created_at >= NOW() - ($1 || ' hours')::interval`,
      [hours],
    );
    return parseInt(result.rows[0].count, 10);
  }

  /** Event counts grouped by processing_status within the last `hours` hours. */
  async countByStatus(hours: number): Promise<Record<string, number>> {
    const result = await this.executeQuery<{
      processing_status: string;
      count: string;
    }>(
      `SELECT processing_status, COUNT(*) AS count FROM ${this.tableName}
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY processing_status`,
      [hours],
    );
    return Object.fromEntries(
      result.rows.map((r) => [r.processing_status, parseInt(r.count, 10)]),
    );
  }

  /** Event counts grouped by event_type within the last `hours` hours. */
  async countByType(hours: number): Promise<Record<string, number>> {
    const result = await this.executeQuery<{
      event_type: string;
      count: string;
    }>(
      `SELECT event_type, COUNT(*) AS count FROM ${this.tableName}
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY event_type
       ORDER BY count DESC`,
      [hours],
    );
    return Object.fromEntries(
      result.rows.map((r) => [r.event_type, parseInt(r.count, 10)]),
    );
  }

  /** Failed events within the last `hours` hours. */
  async getFailedEvents(hours: number): Promise<StripeWebhookEvent[]> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE processing_status = 'failed'
         AND created_at >= NOW() - ($1 || ' hours')::interval
       ORDER BY created_at DESC`,
      [hours],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Average processing time in milliseconds (created_at → processed_at).
   * Returns 0 when no completed events exist in the window.
   */
  async avgProcessingTimeMs(hours: number): Promise<number> {
    const result = await this.executeQuery<{ avg_ms: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000)::numeric AS avg_ms
       FROM ${this.tableName}
       WHERE processing_status = 'completed'
         AND processed_at IS NOT NULL
         AND created_at >= NOW() - ($1 || ' hours')::interval`,
      [hours],
    );
    const raw = result.rows[0]?.avg_ms;
    return raw ? Math.round(parseFloat(raw)) : 0;
  }

  /**
   * Failed events for a manual retry, oldest first. With `maxAttempts`, events that already had
   * that many processing attempts are skipped.
   */
  async findRetryableEvents(
    maxAttempts?: number,
  ): Promise<StripeWebhookEvent[]> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE processing_status = 'failed'
         AND ($1::int IS NULL OR attempts < $1::int)
       ORDER BY created_at ASC`,
      [maxAttempts ?? null],
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

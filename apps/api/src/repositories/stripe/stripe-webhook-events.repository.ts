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
    return 'id, stripe_event_id, event_type, stripe_api_version, data, processing_status, processing_error, attempts, processed_at, created_at';
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
   * Upsert event record — inserts on first attempt, updates status on retry.
   * Uses ON CONFLICT to handle the race where Stripe delivers the same event twice.
   */
  async upsertEvent(
    event: Stripe.Event,
    status: StripeWebhookProcessingStatus,
  ): Promise<StripeWebhookEvent> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `INSERT INTO ${this.tableName} (stripe_event_id, event_type, stripe_api_version, data, processing_status, attempts)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (stripe_event_id) DO UPDATE
         SET processing_status = $5,
             attempts = ${this.tableName}.attempts + 1,
             processing_error = NULL
       RETURNING ${this.getSelectColumns()}`,
      [
        event.id,
        event.type,
        event.api_version ?? null,
        JSON.stringify(event),
        status,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async markCompleted(stripeEventId: string): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName}
       SET processing_status = $2, processed_at = NOW()
       WHERE stripe_event_id = $1`,
      [stripeEventId, WEBHOOK_PROCESSING_STATUS.COMPLETED],
    );
  }

  async markFailed(stripeEventId: string, error: string): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName}
       SET processing_status = $2, processing_error = $3, processed_at = NOW()
       WHERE stripe_event_id = $1`,
      [stripeEventId, WEBHOOK_PROCESSING_STATUS.FAILED, error],
    );
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
   * Failed events eligible for retry: status = 'failed' AND attempts < maxRetries.
   * Ordered oldest-first so retries run in delivery order.
   */
  async findRetryableEvents(maxRetries: number): Promise<StripeWebhookEvent[]> {
    const result = await this.executeQuery<StripeWebhookEventRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName}
       WHERE processing_status = 'failed'
         AND attempts < $1
       ORDER BY created_at ASC`,
      [maxRetries],
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

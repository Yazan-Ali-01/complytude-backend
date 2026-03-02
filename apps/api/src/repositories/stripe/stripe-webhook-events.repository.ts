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
}

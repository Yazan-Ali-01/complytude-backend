import type Stripe from 'stripe';

export const WEBHOOK_PROCESSING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type StripeWebhookProcessingStatus =
  (typeof WEBHOOK_PROCESSING_STATUS)[keyof typeof WEBHOOK_PROCESSING_STATUS];

/**
 * Domain entity for a processed Stripe webhook event,
 * mirroring the `stripe_webhook_events` table (camelCase).
 */
export interface StripeWebhookEvent {
  id: string;
  stripeEventId: string;
  eventType: string;
  stripeApiVersion: string | null;
  data: Stripe.Event;
  processingStatus: StripeWebhookProcessingStatus;
  processingError: string | null;
  /** Processing attempts (claims), not Stripe deliveries. */
  attempts: number;
  /** How many times Stripe delivered the event. */
  deliveries: number;
  processingStartedAt: Date | null;
  /** When a failed event is next re-driven; null once completed or out of attempts. */
  nextRetryAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
}

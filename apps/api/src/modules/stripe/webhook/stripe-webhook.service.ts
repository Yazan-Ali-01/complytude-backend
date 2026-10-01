import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import {
  STRIPE_WEBHOOK_EVENTS,
  WEBHOOK_STALE_PROCESSING_MS,
  webhookNextRetryAt,
} from '../stripe.constants';
import { StripeEventHandlersService } from './stripe-event-handlers';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly webhookEventsRepository: StripeWebhookEventsRepository,
    private readonly handlers: StripeEventHandlersService,
  ) {}

  /**
   * Fetch a stored webhook event by Stripe event ID.
   * Returns the full Stripe.Event from the data column (single source of truth).
   */
  async getEventById(stripeEventId: string): Promise<Stripe.Event | null> {
    const stored =
      await this.webhookEventsRepository.findByStripeEventId(stripeEventId);
    return stored?.data ?? null;
  }

  /**
   * Processes an event at most once at a time: the event is claimed atomically, so a duplicate
   * delivery or a second worker skips it. A failure schedules the next automatic re-drive.
   */
  async processEvent(
    event: Stripe.Event,
    now: Date = new Date(),
  ): Promise<void> {
    await this.webhookEventsRepository.ensureStored(event);
    const claimed = await this.webhookEventsRepository.claim(
      event.id,
      new Date(now.getTime() - WEBHOOK_STALE_PROCESSING_MS),
    );

    if (!claimed) {
      this.logger.log(
        `Event skipped (completed or being processed) — stripe_event_id: ${event.id}`,
      );
      return;
    }

    try {
      await this.routeEvent(event);
      await this.webhookEventsRepository.markCompleted(event.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      const nextRetryAt = webhookNextRetryAt(claimed.attempts, now);
      this.logger.error(
        `Failed to process event ${event.id} (${event.type}), attempt ${claimed.attempts}: ${message}` +
          (nextRetryAt
            ? `; next re-drive at ${nextRetryAt.toISOString()}`
            : '; out of automatic retries'),
        error instanceof Error ? error.stack : undefined,
      );
      await this.webhookEventsRepository.markFailed(
        event.id,
        message,
        nextRetryAt,
      );
      throw error;
    }
  }

  private routeEvent(event: Stripe.Event): Promise<void> | void {
    switch (event.type) {
      case STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_COMPLETED:
        return this.handlers.handleCheckoutCompleted(event);

      case STRIPE_WEBHOOK_EVENTS.SUBSCRIPTION_CREATED:
      case STRIPE_WEBHOOK_EVENTS.SUBSCRIPTION_UPDATED:
      case STRIPE_WEBHOOK_EVENTS.SUBSCRIPTION_DELETED:
        return this.handlers.handleSubscriptionChange(event);

      case STRIPE_WEBHOOK_EVENTS.INVOICE_PAID:
        return this.handlers.handleInvoicePaid(event);

      case STRIPE_WEBHOOK_EVENTS.INVOICE_PAYMENT_FAILED:
        return this.handlers.handleInvoicePaymentFailed(event);

      case STRIPE_WEBHOOK_EVENTS.INVOICE_PAYMENT_ACTION_REQUIRED:
        return this.handlers.handlePaymentActionRequired(event);

      case STRIPE_WEBHOOK_EVENTS.CHARGE_REFUNDED:
      case STRIPE_WEBHOOK_EVENTS.CHARGE_DISPUTE_CREATED:
      case STRIPE_WEBHOOK_EVENTS.CHARGE_DISPUTE_UPDATED:
      case STRIPE_WEBHOOK_EVENTS.CHARGE_DISPUTE_CLOSED:
      case STRIPE_WEBHOOK_EVENTS.CHARGE_DISPUTE_FUNDS_WITHDRAWN:
      case STRIPE_WEBHOOK_EVENTS.CHARGE_DISPUTE_FUNDS_REINSTATED:
        return this.handlers.handleChargeReversal(event);

      default:
        this.logger.log(
          `Unhandled Stripe event type: ${event.type} (id: ${event.id})`,
        );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeWebhookEventsRepository } from 'src/repositories/stripe/stripe-webhook-events.repository';
import { STRIPE_WEBHOOK_EVENTS } from '../stripe.constants';
import { StripeEventHandlersService } from './stripe-event-handlers';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly webhookEventsRepository: StripeWebhookEventsRepository,
    private readonly handlers: StripeEventHandlersService,
  ) {}

  async processEvent(event: Stripe.Event): Promise<void> {
    const existing = await this.webhookEventsRepository.findByStripeEventId(
      event.id,
    );

    if (existing?.processingStatus === 'completed') {
      this.logger.log(`Duplicate event skipped — stripe_event_id: ${event.id}`);
      return;
    }

    await this.webhookEventsRepository.upsertEvent(event, 'processing');

    try {
      await this.routeEvent(event);
      await this.webhookEventsRepository.markCompleted(event.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      this.logger.error(
        `Failed to process event ${event.id} (${event.type}): ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.webhookEventsRepository.markFailed(event.id, message);
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

      default:
        this.logger.log(
          `Unhandled Stripe event type: ${event.type} (id: ${event.id})`,
        );
    }
  }
}

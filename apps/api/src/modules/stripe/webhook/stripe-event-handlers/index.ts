import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * Placeholder handler service for Stripe event types.
 * Actual business logic will be wired in subsequent milestone tickets.
 */
@Injectable()
export class StripeEventHandlersService {
  private readonly logger = new Logger(StripeEventHandlersService.name);

  handleCheckoutCompleted(event: Stripe.Event): void {
    this.logger.log(`[STUB] checkout.session.completed — id: ${event.id}`);
  }

  handleSubscriptionChange(event: Stripe.Event): void {
    this.logger.log(`[STUB] ${event.type} — id: ${event.id}`);
  }

  handleInvoicePaid(event: Stripe.Event): void {
    this.logger.log(`[STUB] invoice.paid — id: ${event.id}`);
  }

  handleInvoicePaymentFailed(event: Stripe.Event): void {
    this.logger.log(`[STUB] invoice.payment_failed — id: ${event.id}`);
  }
}

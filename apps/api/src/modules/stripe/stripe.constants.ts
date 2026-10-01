export const STRIPE_WEBHOOK_EVENTS = {
  // Customer
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_DELETED: 'customer.deleted',

  // Subscription
  SUBSCRIPTION_CREATED: 'customer.subscription.created',
  SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  SUBSCRIPTION_TRIAL_WILL_END: 'customer.subscription.trial_will_end',

  // Invoice
  INVOICE_CREATED: 'invoice.created',
  INVOICE_FINALIZED: 'invoice.finalized',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  INVOICE_PAYMENT_ACTION_REQUIRED: 'invoice.payment_action_required',
  INVOICE_UPCOMING: 'invoice.upcoming',

  // Charge (refunds and disputes of credit purchases)
  CHARGE_REFUNDED: 'charge.refunded',
  CHARGE_DISPUTE_CREATED: 'charge.dispute.created',
  CHARGE_DISPUTE_UPDATED: 'charge.dispute.updated',
  CHARGE_DISPUTE_CLOSED: 'charge.dispute.closed',
  CHARGE_DISPUTE_FUNDS_WITHDRAWN: 'charge.dispute.funds_withdrawn',
  CHARGE_DISPUTE_FUNDS_REINSTATED: 'charge.dispute.funds_reinstated',

  // Payment Intent
  PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
  PAYMENT_INTENT_PAYMENT_FAILED: 'payment_intent.payment_failed',

  // Checkout Session
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  CHECKOUT_SESSION_EXPIRED: 'checkout.session.expired',

  // Payment Method
  PAYMENT_METHOD_ATTACHED: 'payment_method.attached',
  PAYMENT_METHOD_DETACHED: 'payment_method.detached',
} as const;

/** Union of all known Stripe event type strings (e.g. 'invoice.paid'). */
export type StripeWebhookEventType =
  (typeof STRIPE_WEBHOOK_EVENTS)[keyof typeof STRIPE_WEBHOOK_EVENTS];

/** Queue attempts per webhook job (about 30 s of exponential backoff from 2 s). */
export const WEBHOOK_JOB_ATTEMPTS = 5;

/** After this many processing attempts a failed event is no longer re-driven automatically. */
export const WEBHOOK_MAX_PROCESSING_ATTEMPTS = 20;

/** A pending event older than this has lost its queue job and is re-driven. */
export const WEBHOOK_STALE_PENDING_MS = 10 * 60 * 1000;

/** A processing claim older than this belongs to a crashed worker and is re-driven. */
export const WEBHOOK_STALE_PROCESSING_MS = 15 * 60 * 1000;

const WEBHOOK_MAX_RETRY_DELAY_MINUTES = 6 * 60;

/**
 * When a failed event is next re-driven. The queue job covers the first attempts; after that the
 * delay doubles from 1 minute up to 6 hours. Returns null when the event is out of attempts.
 */
export function webhookNextRetryAt(attempts: number, now: Date): Date | null {
  if (attempts >= WEBHOOK_MAX_PROCESSING_ATTEMPTS) return null;
  const minutes = Math.min(
    2 ** Math.max(0, attempts - WEBHOOK_JOB_ATTEMPTS),
    WEBHOOK_MAX_RETRY_DELAY_MINUTES,
  );
  return new Date(now.getTime() + minutes * 60_000);
}

import Stripe from 'stripe';
import { SubscriptionStatus } from 'src/common/types/entitlement.types';

/**
 * Extract billing period (current_period_start, current_period_end) from a Stripe subscription.
 * Stripe API 2026-02-25: period dates moved from subscription root to items.data[0].
 */
export function getSubscriptionPeriod(stripeSub: Stripe.Subscription): {
  start: Date;
  end: Date;
} | null {
  const firstItem = stripeSub.items.data[0];
  if (!firstItem?.current_period_start || !firstItem?.current_period_end) {
    return null;
  }
  return {
    start: new Date(firstItem.current_period_start * 1000),
    end: new Date(firstItem.current_period_end * 1000),
  };
}

/**
 * Stripe statuses that mean the subscription is over: its local row is cancelled and the tenant
 * falls back (webhook handlers downgrade them like a cancellation).
 */
export const ENDED_STRIPE_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  // The first payment never succeeded within 23 hours: Stripe gave up on it
  'incomplete_expired',
]);

/** Statuses a subscription may be provisioned with (paid, or in a trial). */
export const PROVISIONABLE_STRIPE_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
]);

/**
 * Maps a Stripe subscription status string to our internal SubscriptionStatus type.
 * Centralised here to avoid duplication across webhook handlers and subscription service.
 */
export function mapStripeStatusToInternal(
  stripeStatus: string,
): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    // Billing stopped (a Stripe trial ended without a payment method): the past-due policy
    // decides access, from full access for 7 days to read-only
    case 'paused':
      return 'past_due';
    // First payment still pending: never provisioned (checkout and adoption wait for active),
    // so only an already-known row can reach this; treated as unpaid
    case 'incomplete':
      return 'past_due';
    default:
      return 'past_due';
  }
}

/** Batch size for Stripe API calls during reconciliation — stays well within rate limits. */
export const RECONCILIATION_BATCH_SIZE = 10;

/** Delay (ms) between reconciliation batches to avoid hitting rate limits. */
export const RECONCILIATION_BATCH_DELAY_MS = 200;

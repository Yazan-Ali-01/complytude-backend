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
      return 'cancelled';
    default:
      return 'past_due';
  }
}

/** Batch size for Stripe API calls during reconciliation — stays well within rate limits. */
export const RECONCILIATION_BATCH_SIZE = 10;

/** Delay (ms) between reconciliation batches to avoid hitting rate limits. */
export const RECONCILIATION_BATCH_DELAY_MS = 200;

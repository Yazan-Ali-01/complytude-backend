import { SubscriptionStatus } from 'src/common/types/entitlement.types';

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

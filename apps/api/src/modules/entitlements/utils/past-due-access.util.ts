import { HttpException, HttpStatus } from '@nestjs/common';
import { PAST_DUE_GRACE_DAYS } from 'src/common/constants/billing.constant';
import { TenantSubscription } from 'src/common/types/entitlement.types';

export type PastDueAccess =
  | { state: 'full' }
  | { state: 'grace'; since: Date; until: Date }
  | { state: 'read_only'; since: Date; graceEndedAt: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * When the subscription went past due: the first failed payment of this episode
 * (`metadata.past_due_since`), else the last recorded failure, else the row's last update.
 */
export function pastDueSince(subscription: TenantSubscription): Date {
  const metadata = subscription.metadata ?? {};
  const lastFailure = metadata.last_payment_failure as
    | { failed_at?: unknown }
    | undefined;
  return (
    asDate(metadata.past_due_since) ??
    asDate(lastFailure?.failed_at) ??
    subscription.updated_at
  );
}

/** What a subscription entitles its tenant to under the past-due policy, at `now`. */
export function pastDueAccess(
  subscription: TenantSubscription,
  now: Date = new Date(),
): PastDueAccess {
  if (subscription.status !== 'past_due') return { state: 'full' };
  const since = pastDueSince(subscription);
  const until = new Date(since.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS);
  return now < until
    ? { state: 'grace', since, until }
    : { state: 'read_only', since, graceEndedAt: until };
}

/**
 * The subscription metadata to store for a status change: starts the grace clock when the
 * subscription becomes past due (kept across Stripe's retries), clears it when it recovers.
 * Returns null when nothing changes.
 */
export function metadataForStatus(
  metadata: Record<string, unknown> | undefined,
  newStatus: string,
  now: Date = new Date(),
): Record<string, unknown> | null {
  const current = metadata ?? {};
  if (newStatus === 'past_due') {
    return current.past_due_since
      ? null
      : { ...current, past_due_since: now.toISOString() };
  }
  if (current.past_due_since) {
    const { past_due_since: _cleared, ...rest } = current;
    return rest;
  }
  return null;
}

/** The 402 for usage denied because the tenant is past its payment grace period. */
export function paymentOverdueException(
  featureKey: string,
  message: string,
): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      message,
      reason: 'payment_required',
      feature: featureKey,
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}

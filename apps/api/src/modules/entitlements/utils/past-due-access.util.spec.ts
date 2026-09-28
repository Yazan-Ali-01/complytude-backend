import { TenantSubscription } from 'src/common/types/entitlement.types';
import { metadataForStatus, pastDueAccess } from './past-due-access.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-29T12:00:00Z');

function subscription(
  status: TenantSubscription['status'],
  metadata: Record<string, unknown> = {},
): TenantSubscription {
  return {
    status,
    metadata,
    updated_at: new Date(now.getTime() - 30 * DAY_MS),
  } as TenantSubscription;
}

describe('pastDueAccess', () => {
  it('gives full access to a subscription that is not past due', () => {
    expect(pastDueAccess(subscription('active'), now)).toEqual({
      state: 'full',
    });
  });

  it('gives 7 days of grace from the first failed payment', () => {
    const since = new Date(now.getTime() - 6 * DAY_MS);
    expect(
      pastDueAccess(
        subscription('past_due', { past_due_since: since.toISOString() }),
        now,
      ),
    ).toEqual({
      state: 'grace',
      since,
      until: new Date(since.getTime() + 7 * DAY_MS),
    });
  });

  it('is read-only once the grace period has ended', () => {
    const since = new Date(now.getTime() - 7 * DAY_MS);
    expect(
      pastDueAccess(
        subscription('past_due', { past_due_since: since.toISOString() }),
        now,
      ).state,
    ).toBe('read_only');
  });

  it('falls back to the last failure, then the last update, when the clock was never started', () => {
    const failedAt = new Date(now.getTime() - 2 * DAY_MS);
    expect(
      pastDueAccess(
        subscription('past_due', {
          last_payment_failure: { failed_at: failedAt.toISOString() },
        }),
        now,
      ).state,
    ).toBe('grace');
    expect(pastDueAccess(subscription('past_due'), now).state).toBe(
      'read_only',
    );
  });
});

describe('metadataForStatus', () => {
  it('starts the clock once and keeps it through retries', () => {
    const started = metadataForStatus({ a: 1 }, 'past_due', now);
    expect(started).toEqual({ a: 1, past_due_since: now.toISOString() });
    expect(
      metadataForStatus(started!, 'past_due', new Date(now.getTime() + DAY_MS)),
    ).toBeNull();
  });

  it('clears the clock when the subscription recovers, and otherwise changes nothing', () => {
    expect(
      metadataForStatus({ a: 1, past_due_since: 'x' }, 'active', now),
    ).toEqual({ a: 1 });
    expect(metadataForStatus({ a: 1 }, 'active', now)).toBeNull();
  });
});

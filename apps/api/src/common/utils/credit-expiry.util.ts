/** A credit ledger row as the expiry replay needs it. */
export interface CreditReplayRow {
  id: string;
  transactionType: string;
  amount: number;
  expiresAt: Date | null;
  recordedAt: Date;
  /** For an `expiry` row: the grant it expired. */
  expiredTransactionId: string | null;
}

/** A lapsed grant and how much of it was still unspent when it lapsed. */
export interface CreditExpiry {
  transactionId: string;
  remaining: number;
  expiredAt: Date;
}

interface Lot {
  id: string;
  remaining: number;
  expiresAt: Date | null;
  recordedAt: Date;
}

/**
 * Which credits each lapsed grant still held when it lapsed. The ledger records spending, not which
 * credits were spent, so it is replayed in time order: every credit row is a lot, and every debit
 * spends the lots that expire soonest first (lots that never expire last, then the oldest), as a
 * customer would want. At a lot's expiry its unspent remainder lapses. Lots already expired by an
 * `expiry` row are reported with nothing remaining. Only lots that lapsed by `now` are reported.
 */
export function computeCreditExpiries(
  rows: CreditReplayRow[],
  now: Date,
): CreditExpiry[] {
  const lots = new Map<string, Lot>();
  const alreadyExpired = new Set(
    rows
      .filter((row) => row.transactionType === 'expiry')
      .map((row) => row.expiredTransactionId)
      .filter((id): id is string => id !== null),
  );

  type Event =
    | { at: Date; kind: 'row'; row: CreditReplayRow }
    | { at: Date; kind: 'lapse'; lotId: string };
  const events: Event[] = rows.map((row) => ({
    at: row.recordedAt,
    kind: 'row',
    row,
  }));
  for (const row of rows) {
    if (row.amount > 0 && row.expiresAt && row.expiresAt <= now) {
      events.push({ at: row.expiresAt, kind: 'lapse', lotId: row.id });
    }
  }
  // At the same instant a lot lapses before anything is spent from it
  events.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      (a.kind === b.kind ? 0 : a.kind === 'lapse' ? -1 : 1),
  );

  const spendOrder = (a: Lot, b: Lot): number => {
    if (a.expiresAt && b.expiresAt) {
      return a.expiresAt.getTime() - b.expiresAt.getTime();
    }
    if (a.expiresAt || b.expiresAt) return a.expiresAt ? -1 : 1;
    return a.recordedAt.getTime() - b.recordedAt.getTime();
  };

  const expiries: CreditExpiry[] = [];
  for (const event of events) {
    if (event.kind === 'lapse') {
      const lot = lots.get(event.lotId);
      if (!lot) continue;
      expiries.push({
        transactionId: lot.id,
        remaining: alreadyExpired.has(lot.id) ? 0 : lot.remaining,
        expiredAt: event.at,
      });
      lot.remaining = 0;
      continue;
    }

    const { row } = event;
    if (row.amount > 0) {
      lots.set(row.id, {
        id: row.id,
        remaining: row.amount,
        expiresAt: row.expiresAt,
        recordedAt: row.recordedAt,
      });
      continue;
    }
    // An expiry row only records a lapse already applied to its lot
    if (row.transactionType === 'expiry') continue;

    let toSpend = -row.amount;
    for (const lot of [...lots.values()]
      .filter((l) => l.remaining > 0)
      .sort(spendOrder)) {
      if (toSpend === 0) break;
      const spent = Math.min(lot.remaining, toSpend);
      lot.remaining -= spent;
      toSpend -= spent;
    }
  }
  return expiries;
}

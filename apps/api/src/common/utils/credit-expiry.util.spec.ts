import { computeCreditExpiries, CreditReplayRow } from './credit-expiry.util';

const day = (n: number): Date => new Date(Date.UTC(2026, 9, n));
let seq = 0;
const row = (
  transactionType: string,
  amount: number,
  recordedAt: Date,
  extra: Partial<CreditReplayRow> = {},
): CreditReplayRow => ({
  id: `t${++seq}`,
  transactionType,
  amount,
  expiresAt: null,
  recordedAt,
  expiredTransactionId: null,
  ...extra,
});

describe('computeCreditExpiries', () => {
  it('spends the expiring grant first, so only its unspent part lapses', () => {
    const purchase = row('purchase', 100, day(1));
    const grant = row('grant', 50, day(2), { expiresAt: day(10) });
    const spend = row('deduction', -30, day(5));

    expect(computeCreditExpiries([purchase, grant, spend], day(11))).toEqual([
      { transactionId: grant.id, remaining: 20, expiredAt: day(10) },
    ]);
  });

  it('spends purchased credits once the grant is used up, and nothing lapses', () => {
    const purchase = row('purchase', 100, day(1));
    const grant = row('grant', 50, day(2), { expiresAt: day(10) });
    const spend = row('deduction', -80, day(5));

    expect(computeCreditExpiries([purchase, grant, spend], day(11))).toEqual([
      { transactionId: grant.id, remaining: 0, expiredAt: day(10) },
    ]);
  });

  it('a grant cannot fund spending recorded before it was granted', () => {
    const purchase = row('purchase', 100, day(1));
    const spend = row('deduction', -30, day(2));
    const grant = row('grant', 50, day(3), { expiresAt: day(10) });

    expect(computeCreditExpiries([purchase, spend, grant], day(11))).toEqual([
      { transactionId: grant.id, remaining: 50, expiredAt: day(10) },
    ]);
  });

  it('spending after a lapse comes from what is left, not the lapsed grant', () => {
    const purchase = row('purchase', 100, day(1));
    const grant = row('grant', 50, day(2), { expiresAt: day(10) });
    const late = row('deduction', -40, day(12));

    expect(computeCreditExpiries([purchase, grant, late], day(13))).toEqual([
      { transactionId: grant.id, remaining: 50, expiredAt: day(10) },
    ]);
  });

  it('the grant expiring soonest is spent first', () => {
    const later = row('grant', 50, day(1), { expiresAt: day(20) });
    const sooner = row('grant', 50, day(2), { expiresAt: day(10) });
    const spend = row('deduction', -60, day(5));

    expect(computeCreditExpiries([later, sooner, spend], day(21))).toEqual([
      { transactionId: sooner.id, remaining: 0, expiredAt: day(10) },
      { transactionId: later.id, remaining: 40, expiredAt: day(20) },
    ]);
  });

  it('reports nothing left for a grant that already has its expiry row', () => {
    const grant = row('grant', 50, day(2), { expiresAt: day(10) });
    const expired = row('expiry', -50, day(11), {
      expiredTransactionId: grant.id,
    });

    expect(computeCreditExpiries([grant, expired], day(12))).toEqual([
      { transactionId: grant.id, remaining: 0, expiredAt: day(10) },
    ]);
  });

  it('ignores grants that have not lapsed yet', () => {
    const grant = row('grant', 50, day(2), { expiresAt: day(30) });

    expect(computeCreditExpiries([grant], day(11))).toEqual([]);
  });
});

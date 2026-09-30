import { addMonths, deriveBillingPeriod } from './billing.util';

describe('billing periods', () => {
  it('keys a period by the instant it started, in UTC to the millisecond', () => {
    expect(deriveBillingPeriod(new Date('2026-10-15T09:30:12.345Z'))).toBe(
      '2026-10-15T09:30:12.345Z',
    );
    expect(deriveBillingPeriod(new Date('2026-10-01T02:00:00+04:00'))).toBe(
      '2026-09-30T22:00:00.000Z',
    );
  });

  it('gives two periods that start in the same month different keys', () => {
    // A trial on 1 October converted to a paid plan on 15 October starts from zero
    expect(deriveBillingPeriod(new Date('2026-10-01T08:00:00Z'))).not.toBe(
      deriveBillingPeriod(new Date('2026-10-15T08:00:00Z')),
    );
  });

  it('adds calendar months, keeping to the last day of a shorter month', () => {
    const iso = (d: Date): string => d.toISOString();
    expect(iso(addMonths(new Date('2026-01-31T10:00:00Z'), 1))).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(iso(addMonths(new Date('2028-01-31T10:00:00Z'), 1))).toBe(
      '2028-02-29T10:00:00.000Z',
    );
    expect(iso(addMonths(new Date('2026-03-31T00:00:00Z'), 1))).toBe(
      '2026-04-30T00:00:00.000Z',
    );
    expect(iso(addMonths(new Date('2026-12-15T23:59:00Z'), 1))).toBe(
      '2027-01-15T23:59:00.000Z',
    );
  });
});

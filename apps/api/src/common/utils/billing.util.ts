/**
 * The key of a billing period: the instant it started, in UTC to the millisecond
 * (`2026-10-15T09:30:00.000Z`). Usage is counted per period, so a new period (a Stripe renewal, a
 * trial ending, a paid checkout, a free-plan renewal) starts from zero, even within a month.
 */
export function deriveBillingPeriod(periodStart: Date): string {
  return periodStart.toISOString();
}

/**
 * The same key computed in SQL from a `timestamptz` column (e.g. `ts.current_period_start`).
 * Both sides truncate below the millisecond (`MS` in Postgres, `Date` in node-pg).
 */
export function billingPeriodSql(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

/**
 * `date` plus `months` calendar months, on the same day of the month or the month's last day when
 * it has fewer (31 January + 1 month = 28 or 29 February, never 3 March), in UTC.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

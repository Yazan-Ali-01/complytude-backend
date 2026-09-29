import { Transform } from 'class-transformer';

/**
 * Trims and lower-cases an email address before validation. Accounts and invitations are keyed
 * on the lower-case address (the database enforces it), so `Alice@corp.com` and `alice@corp.com`
 * are the same person everywhere.
 */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}

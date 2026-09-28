/**
 * Credit Packages Constants
 *
 * Source of truth for one-time credit bundle definitions.
 * Synced to Stripe Products/Prices on startup via StripeCatalogSyncService.
 * Stripe IDs are persisted to public.credit_packages after sync.
 */

import { DEFAULT_CURRENCY } from './billing.constant';

export interface CreditPackageDefinition {
  key: string;
  name: string;
  credits: number;
  /** Price in the default currency (AED) */
  price: number;
}

export const CREDIT_PACKAGES: CreditPackageDefinition[] = [
  { key: 'credits_50', name: '50 Credits', credits: 50, price: 49 },
  { key: 'credits_200', name: '200 Credits', credits: 200, price: 179 },
  { key: 'credits_500', name: '500 Credits', credits: 500, price: 399 },
] as const;

/**
 * Get the currency code for credit packages
 */
export const CREDIT_PACKAGE_CURRENCY = DEFAULT_CURRENCY;

/** A deduction that takes the balance below this sends the tenant a low-balance email. */
export const LOW_CREDIT_BALANCE_THRESHOLD = 10;

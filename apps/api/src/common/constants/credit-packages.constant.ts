/**
 * Credit Packages Constants
 *
 * Source of truth for one-time credit bundle definitions.
 * Synced to Stripe Products/Prices on startup via StripeCatalogSyncService.
 * Stripe IDs are persisted to public.credit_packages after sync.
 */

export interface CreditPackageDefinition {
  key: string;
  name: string;
  credits: number;
  price_aed: number;
}

export const CREDIT_PACKAGES: CreditPackageDefinition[] = [
  { key: 'credits_50', name: '50 Credits', credits: 50, price_aed: 49 },
  { key: 'credits_200', name: '200 Credits', credits: 200, price_aed: 179 },
  { key: 'credits_500', name: '500 Credits', credits: 500, price_aed: 399 },
] as const;

/**
 * Billing-related constants for the Complytude platform
 *
 * This file centralizes all billing configuration to avoid hardcoding
 * currency codes and pricing calculations throughout the codebase.
 */

/**
 * Default currency for all pricing in the platform
 */
export const DEFAULT_CURRENCY = 'AED' as const;

/**
 * Currency code in lowercase (for Stripe API and other services)
 */
export const DEFAULT_CURRENCY_LOWERCASE = 'aed' as const;

/**
 * Annual billing discount configuration
 *
 * Annual plans are priced at 10 months instead of 12 (2 months free)
 * This represents a ~16.67% discount
 */
export const ANNUAL_BILLING = {
  /**
   * Number of months to charge for annual billing (out of 12)
   * 10 months = 2 months free
   */
  CHARGED_MONTHS: 10,

  /**
   * Total months in a year
   */
  TOTAL_MONTHS: 12,

  /**
   * Discount percentage (calculated)
   */
  DISCOUNT_PERCENTAGE: Math.round((1 - 10 / 12) * 100 * 100) / 100, // ~16.67%
} as const;

/**
 * Currency conversion utilities
 */
export const CURRENCY_UTILS = {
  /**
   * Convert AED amount to fils (smallest currency unit for Stripe)
   * 1 AED = 100 fils
   */
  aedToFils: (aed: number): number => Math.round(aed * 100),

  /**
   * Convert fils to AED (major currency unit)
   * 100 fils = 1 AED
   */
  filsToAed: (fils: number): number => fils / 100,
} as const;

/**
 * Type definitions for better type safety
 */
export type CurrencyCode = typeof DEFAULT_CURRENCY;
export type CurrencyCodeLowercase = typeof DEFAULT_CURRENCY_LOWERCASE;

/**
 * Days of full access a paying tenant keeps after its first failed payment. After that the
 * tenant is read-only (no new usage) until it pays; Stripe's cancellation moves it to Navigator.
 */
export const PAST_DUE_GRACE_DAYS = 7;

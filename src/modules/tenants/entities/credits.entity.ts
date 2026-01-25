/**
 * Credit system entities for the Add-on Credits ("Top-up" Model)
 * SHELL: This module requires billing integration (Stripe) to be fully functional
 */

// =========================
// CREDIT PACKAGE
// =========================

export interface CreditPackage {
  id: string;
  name: string;
  featureKey: string;
  credits: number;
  priceAed: number;
  isActive: boolean;
  createdAt: Date;
}

export interface CreditPackageRow {
  id: string;
  name: string;
  feature_key: string;
  credits: number;
  price_aed: string | number;
  is_active: boolean;
  created_at: Date;
}

export function mapCreditPackageRow(row: CreditPackageRow): CreditPackage {
  return {
    id: row.id,
    name: row.name,
    featureKey: row.feature_key,
    credits: row.credits,
    priceAed:
      typeof row.price_aed === 'string'
        ? parseFloat(row.price_aed)
        : row.price_aed,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

// =========================
// TENANT CREDITS (Balance)
// =========================

export interface TenantCredits {
  id: string;
  tenantId: string;
  featureKey: string;
  creditsRemaining: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantCreditsRow {
  id: string;
  tenant_id: string;
  feature_key: string;
  credits_remaining: number;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function mapTenantCreditsRow(row: TenantCreditsRow): TenantCredits {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    featureKey: row.feature_key,
    creditsRemaining: row.credits_remaining,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =========================
// CREDIT TRANSACTION
// =========================

export type CreditTransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded';

export interface CreditTransaction {
  id: string;
  tenantId: string;
  packageId: string;
  credits: number;
  priceAed: number;
  paymentReference: string | null;
  status: CreditTransactionStatus;
  createdAt: Date;
}

export interface CreditTransactionRow {
  id: string;
  tenant_id: string;
  package_id: string;
  credits: number;
  price_aed: string | number;
  payment_reference: string | null;
  status: string;
  created_at: Date;
}

export function mapCreditTransactionRow(
  row: CreditTransactionRow,
): CreditTransaction {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    packageId: row.package_id,
    credits: row.credits,
    priceAed:
      typeof row.price_aed === 'string'
        ? parseFloat(row.price_aed)
        : row.price_aed,
    paymentReference: row.payment_reference,
    status: row.status as CreditTransactionStatus,
    createdAt: row.created_at,
  };
}

// =========================
// INPUT TYPES (Stubs)
// =========================

/**
 * Input for purchasing credits
 * TODO: Integrate with Stripe payment flow
 */
export interface PurchaseCreditsInput {
  /** The credit package to purchase */
  packageId: string;

  /**
   * Payment reference from payment provider (e.g., Stripe payment intent ID)
   * TODO: This will be populated by the billing integration
   */
  paymentReference?: string;

  /**
   * TODO: Add payment method selection
   * paymentMethodId?: string;
   */
}

// =========================
// RESPONSE TYPES
// =========================

export interface CreditBalance {
  featureKey: string;
  creditsRemaining: number;
  expiresAt: Date | null;
}

export interface TenantCreditsSummary {
  tenantId: string;
  balances: CreditBalance[];
}

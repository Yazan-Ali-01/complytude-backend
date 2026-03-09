export const BILLING_JOB_NAMES = {
  DUNNING_EMAIL: 'dunning-email',
  STRIPE_RECONCILIATION: 'stripe-reconciliation',
} as const;

export type BillingJobName =
  (typeof BILLING_JOB_NAMES)[keyof typeof BILLING_JOB_NAMES];

export interface DunningEmailJobData {
  tenantId: string;
  tenantAdminEmail: string;
  stripeSubscriptionId: string;
  invoiceId: string;
  hostedInvoiceUrl: string;
  attemptCount: number;
  dunningSequence: 'day0' | 'day3' | 'day5';
  amount: number;
  currency: string;
  dueDate: string;
  tenantName?: string;
}

export interface StripeReconciliationJobData {
  tenantId?: string; // Optional - if provided, reconcile only this tenant
  reason: 'scheduled' | 'manual' | 'webhook_failure';
}

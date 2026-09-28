export const BILLING_JOB_NAMES = {
  DUNNING_EMAIL: 'dunning-email',
  PAYMENT_ACTION_REQUIRED: 'payment-action-required',
  STRIPE_RECONCILIATION: 'stripe-reconciliation',
  STRIPE_WEBHOOK_PROCESSING: 'stripe-webhook-processing',
  STRIPE_WEBHOOK_REDRIVE: 'stripe-webhook-redrive',
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

export interface PaymentActionRequiredJobData {
  tenantId: string;
  tenantAdminEmail: string;
  stripeSubscriptionId: string;
  invoiceId: string;
  hostedInvoiceUrl: string;
  amount: number;
  currency: string;
  tenantName?: string;
}

export interface StripeReconciliationJobData {
  tenantId?: string; // Optional - if provided, reconcile only this tenant
  reason: 'scheduled' | 'manual' | 'webhook_failure';
}

export interface StripeWebhookProcessingJobData {
  stripeEventId: string;
}

/** Scheduled sweep that re-drives failed and stranded webhook events. */
export type StripeWebhookRedriveJobData = Record<string, never>;

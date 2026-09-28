export const TENANT_JOB_NAMES = {
  STRIPE_CUSTOMER_CREATION: 'stripe-customer-creation',
  /** Repeatable: fails documents and jobs stuck in queued/processing (all tenants). */
  STUCK_WORK_SWEEP: 'stuck-work-sweep',
} as const;

export type TenantJobName =
  (typeof TENANT_JOB_NAMES)[keyof typeof TENANT_JOB_NAMES];

export interface TenantStripeCustomerCreationJobData {
  tenantId: string;
  email: string;
  userId: string;
}

export interface TenantStuckWorkSweepJobData {
  triggeredAt: string;
}

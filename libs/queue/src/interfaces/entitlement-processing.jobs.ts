export const ENTITLEMENT_JOB_NAMES = {
  SNAPSHOT_REBUILD: 'snapshot-rebuild',
  DOMAIN_EVENT_FANOUT: 'domain-event-fanout',
  CREDIT_EVENT: 'credit-event',
  PROJECTION_UPDATE: 'projection-update',
  SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  CREDIT_NOTIFICATION: 'credit-notification',
  QUOTA_EXCEEDED: 'quota-exceeded',
  TRIAL_EXPIRY_CHECK: 'trial-expiry-check',
  TRIAL_REMINDER_CHECK: 'trial-reminder-check',
  USAGE_REFUND: 'usage-refund',
} as const;

export type EntitlementJobName =
  (typeof ENTITLEMENT_JOB_NAMES)[keyof typeof ENTITLEMENT_JOB_NAMES];

export interface EntitlementSnapshotRebuildJobData {
  tenantId: string;
  reason: 'invalidation' | 'scheduled' | 'manual';
}

export interface EntitlementDomainEventFanoutJobData {
  eventId: string;
  eventType: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface EntitlementCreditEventJobData {
  tenantId: string;
  transactionType:
    | 'purchased'
    | 'granted'
    | 'deducted'
    | 'refunded'
    | 'expired';
  amount: number;
  remainingBalance: number;
  featureKey?: string;
}

export interface EntitlementProjectionUpdateJobData {
  usageLedgerId: string;
  tenantId: string;
  featureKey: string;
  featureId: string;
  featureName: string;
  featureType: string;
  subscriptionId: string;
  units: number;
  billingPeriod: string;
  allocations: Array<{
    source: 'plan' | 'addon' | 'credit' | 'override';
    units: number;
  }>;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  recordedAt: string;
  idempotencyKey?: string;
  creditDeducted: boolean;
  creditAmount?: number;
}

export interface EntitlementSubscriptionRenewalJobData {
  tenantId: string;
  subscriptionId: string;
}

export interface EntitlementTrialExpiryCheckJobData {
  triggeredAt: string;
}

/**
 * Trigger payload for the "trial ending soon" reminder cron.
 * Carries no per-tenant data — the handler scans the DB for trials in the
 * configured reminder window and dispatches one email per row.
 */
export interface EntitlementTrialReminderCheckJobData {
  triggeredAt: string;
}

export interface EntitlementCreditNotificationJobData {
  tenantId: string;
  transactionType: 'purchased' | 'granted' | 'deducted' | 'refunded';
  amount: number;
  remainingBalance: number;
}

export interface EntitlementQuotaExceededJobData {
  tenantId: string;
  featureKey: string;
  requestedUnits: number;
  limit: number;
  used: number;
  reason: string;
}

/**
 * Payload for USAGE_REFUND jobs.
 *
 * Emitted by workers when an async job fails permanently after entitlement
 * was already deducted on the API side. The handler finds the usage_ledger
 * entry via resource_id, voids it, and rebuilds the aggregated_usage projection.
 */
export interface EntitlementUsageRefundJobData {
  tenantId: string;
  /** ID of the failed async job (generation_jobs.id). Used as resource_id lookup key. */
  resourceId: string;
  resourceType: string;
  featureKey: string;
  units: number;
}

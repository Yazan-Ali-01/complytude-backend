export const ENTITLEMENT_JOB_NAMES = {
  SNAPSHOT_REBUILD: 'snapshot-rebuild',
  DOMAIN_EVENT_FANOUT: 'domain-event-fanout',
  CREDIT_EVENT: 'credit-event',
  PROJECTION_UPDATE: 'projection-update',
  SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  CREDIT_NOTIFICATION: 'credit-notification',
  QUOTA_EXCEEDED: 'quota-exceeded',
  TRIAL_EXPIRY_CHECK: 'trial-expiry-check',
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

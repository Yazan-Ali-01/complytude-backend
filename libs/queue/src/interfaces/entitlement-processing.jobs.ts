export const ENTITLEMENT_JOB_NAMES = {
  SNAPSHOT_REBUILD: 'snapshot-rebuild',
  DOMAIN_EVENT_FANOUT: 'domain-event-fanout',
  CREDIT_EVENT: 'credit-event',
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

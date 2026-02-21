export const INGESTION_JOB_NAMES = {
  DOCUMENT_INGESTION: 'document-ingestion',
  USAGE_PROJECTION_UPDATE: 'usage-projection-update',
  SNAPSHOT_REBUILD: 'snapshot-rebuild',
  DOMAIN_EVENT_FANOUT: 'domain-event-fanout',
  SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  CREDIT_NOTIFICATION: 'credit-notification',
} as const;

export type IngestionJobName =
  (typeof INGESTION_JOB_NAMES)[keyof typeof INGESTION_JOB_NAMES];

export interface DocumentIngestionJobData {
  tenantId: string;
  documentId: string;
  s3QuarantineKey: string;
  originalFilename: string;
  mimeType: string;
}

export interface UsageProjectionUpdateJobData {
  tenantId: string;
  featureKey: string;
  usageEventId: string;
  periodStart: string;
  periodEnd: string;
}

export interface SnapshotRebuildJobData {
  tenantId: string;
  reason: 'invalidation' | 'scheduled' | 'manual';
}

export interface DomainEventFanoutJobData {
  eventId: string;
  eventType: string;
  tenantId: string;
  payload: Record<string, unknown>;
}

export interface SubscriptionRenewalJobData {
  tenantId: string;
  subscriptionId: string;
}

export interface CreditNotificationJobData {
  tenantId: string;
  transactionType: 'purchased' | 'granted' | 'deducted' | 'refunded';
  amount: number;
  remainingBalance: number;
}

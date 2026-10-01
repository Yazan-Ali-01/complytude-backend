import {
  AI_JOB_NAMES,
  DocumentAnalysisJobData,
} from './interfaces/ai-processing.jobs';
import {
  BILLING_JOB_NAMES,
  DunningEmailJobData,
  PaymentActionRequiredJobData,
  StripeReconciliationJobData,
  StripeWebhookProcessingJobData,
  StripeWebhookRedriveJobData,
  SubscriptionRenewalJobData,
} from './interfaces/billing-processing.jobs';
import {
  DocumentIngestionJobData,
  INGESTION_JOB_NAMES,
  RulesetIngestionJobData,
} from './interfaces/data-ingestion.jobs';
import {
  DocumentGenerationJobData,
  GENERATION_JOB_NAMES,
} from './interfaces/document-generation.jobs';
import {
  ENTITLEMENT_JOB_NAMES,
  EntitlementCreditEventJobData,
  EntitlementCreditNotificationJobData,
  EntitlementDomainEventFanoutJobData,
  EntitlementProjectionUpdateJobData,
  EntitlementQuotaExceededJobData,
  EntitlementSnapshotRebuildJobData,
  EntitlementSubscriptionRenewalJobData,
  EntitlementTrialExpiryCheckJobData,
  EntitlementCreditExpiryCheckJobData,
  EntitlementTrialReminderCheckJobData,
  EntitlementUsageRefundJobData,
} from './interfaces/entitlement-processing.jobs';
import {
  TENANT_JOB_NAMES,
  TenantStripeCustomerCreationJobData,
  TenantDataRetentionSweepJobData,
  TenantQueueMetricsJobData,
  TenantStuckWorkSweepJobData,
} from './interfaces/tenant-processing.jobs';
import { QUEUE_NAMES } from './queue.constants';

export interface QueueJobMap {
  [QUEUE_NAMES.AI_PROCESSING]: {
    [AI_JOB_NAMES.DOCUMENT_ANALYSIS]: DocumentAnalysisJobData;
  };
  [QUEUE_NAMES.BILLING_PROCESSING]: {
    [BILLING_JOB_NAMES.DUNNING_EMAIL]: DunningEmailJobData;
    [BILLING_JOB_NAMES.PAYMENT_ACTION_REQUIRED]: PaymentActionRequiredJobData;
    [BILLING_JOB_NAMES.STRIPE_RECONCILIATION]: StripeReconciliationJobData;
    [BILLING_JOB_NAMES.STRIPE_WEBHOOK_PROCESSING]: StripeWebhookProcessingJobData;
    [BILLING_JOB_NAMES.STRIPE_WEBHOOK_REDRIVE]: StripeWebhookRedriveJobData;
    [BILLING_JOB_NAMES.SUBSCRIPTION_RENEWAL]: SubscriptionRenewalJobData;
  };
  [QUEUE_NAMES.DATA_INGESTION]: {
    [INGESTION_JOB_NAMES.DOCUMENT_INGESTION]: DocumentIngestionJobData;
    [INGESTION_JOB_NAMES.RULESET_INGESTION]: RulesetIngestionJobData;
  };
  [QUEUE_NAMES.ENTITLEMENT_PROCESSING]: {
    [ENTITLEMENT_JOB_NAMES.SNAPSHOT_REBUILD]: EntitlementSnapshotRebuildJobData;
    [ENTITLEMENT_JOB_NAMES.DOMAIN_EVENT_FANOUT]: EntitlementDomainEventFanoutJobData;
    [ENTITLEMENT_JOB_NAMES.CREDIT_EVENT]: EntitlementCreditEventJobData;
    [ENTITLEMENT_JOB_NAMES.PROJECTION_UPDATE]: EntitlementProjectionUpdateJobData;
    [ENTITLEMENT_JOB_NAMES.SUBSCRIPTION_RENEWAL]: EntitlementSubscriptionRenewalJobData;
    [ENTITLEMENT_JOB_NAMES.CREDIT_NOTIFICATION]: EntitlementCreditNotificationJobData;
    [ENTITLEMENT_JOB_NAMES.QUOTA_EXCEEDED]: EntitlementQuotaExceededJobData;
    [ENTITLEMENT_JOB_NAMES.TRIAL_EXPIRY_CHECK]: EntitlementTrialExpiryCheckJobData;
    [ENTITLEMENT_JOB_NAMES.CREDIT_EXPIRY_CHECK]: EntitlementCreditExpiryCheckJobData;
    [ENTITLEMENT_JOB_NAMES.TRIAL_REMINDER_CHECK]: EntitlementTrialReminderCheckJobData;
    [ENTITLEMENT_JOB_NAMES.USAGE_REFUND]: EntitlementUsageRefundJobData;
  };
  [QUEUE_NAMES.TENANT_PROCESSING]: {
    [TENANT_JOB_NAMES.STRIPE_CUSTOMER_CREATION]: TenantStripeCustomerCreationJobData;
    [TENANT_JOB_NAMES.STUCK_WORK_SWEEP]: TenantStuckWorkSweepJobData;
    [TENANT_JOB_NAMES.QUEUE_METRICS]: TenantQueueMetricsJobData;
    [TENANT_JOB_NAMES.DATA_RETENTION_SWEEP]: TenantDataRetentionSweepJobData;
  };
  [QUEUE_NAMES.DOCUMENT_GENERATION]: {
    [GENERATION_JOB_NAMES.DOCUMENT_GENERATION]: DocumentGenerationJobData;
  };
}

export type QueueName = keyof QueueJobMap;
export type JobNameFor<Q extends QueueName> = keyof QueueJobMap[Q] & string;
export type JobDataFor<
  Q extends QueueName,
  J extends JobNameFor<Q>,
> = QueueJobMap[Q][J];

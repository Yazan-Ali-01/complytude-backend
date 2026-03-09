import { QUEUE_NAMES } from './queue.constants';
import {
  AI_JOB_NAMES,
  ArabicTranslationJobData,
  DocumentGenerationJobData,
  TemplateAnalysisJobData,
} from './interfaces/ai-processing.jobs';
import {
  BILLING_JOB_NAMES,
  DunningEmailJobData,
  StripeReconciliationJobData,
  StripeWebhookProcessingJobData,
} from './interfaces/billing-processing.jobs';
import {
  DocumentIngestionJobData,
  INGESTION_JOB_NAMES,
} from './interfaces/data-ingestion.jobs';
import {
  ENTITLEMENT_JOB_NAMES,
  EntitlementCreditEventJobData,
  EntitlementCreditNotificationJobData,
  EntitlementDomainEventFanoutJobData,
  EntitlementProjectionUpdateJobData,
  EntitlementSnapshotRebuildJobData,
  EntitlementSubscriptionRenewalJobData,
} from './interfaces/entitlement-processing.jobs';

export interface QueueJobMap {
  [QUEUE_NAMES.AI_PROCESSING]: {
    [AI_JOB_NAMES.DOCUMENT_GENERATION]: DocumentGenerationJobData;
    [AI_JOB_NAMES.TEMPLATE_ANALYSIS]: TemplateAnalysisJobData;
    [AI_JOB_NAMES.ARABIC_TRANSLATION]: ArabicTranslationJobData;
  };
  [QUEUE_NAMES.BILLING_PROCESSING]: {
    [BILLING_JOB_NAMES.DUNNING_EMAIL]: DunningEmailJobData;
    [BILLING_JOB_NAMES.STRIPE_RECONCILIATION]: StripeReconciliationJobData;
    [BILLING_JOB_NAMES.STRIPE_WEBHOOK_PROCESSING]: StripeWebhookProcessingJobData;
  };
  [QUEUE_NAMES.DATA_INGESTION]: {
    [INGESTION_JOB_NAMES.DOCUMENT_INGESTION]: DocumentIngestionJobData;
  };
  [QUEUE_NAMES.ENTITLEMENT_PROCESSING]: {
    [ENTITLEMENT_JOB_NAMES.SNAPSHOT_REBUILD]: EntitlementSnapshotRebuildJobData;
    [ENTITLEMENT_JOB_NAMES.DOMAIN_EVENT_FANOUT]: EntitlementDomainEventFanoutJobData;
    [ENTITLEMENT_JOB_NAMES.CREDIT_EVENT]: EntitlementCreditEventJobData;
    [ENTITLEMENT_JOB_NAMES.PROJECTION_UPDATE]: EntitlementProjectionUpdateJobData;
    [ENTITLEMENT_JOB_NAMES.SUBSCRIPTION_RENEWAL]: EntitlementSubscriptionRenewalJobData;
    [ENTITLEMENT_JOB_NAMES.CREDIT_NOTIFICATION]: EntitlementCreditNotificationJobData;
  };
}

export type QueueName = keyof QueueJobMap;
export type JobNameFor<Q extends QueueName> = keyof QueueJobMap[Q] & string;
export type JobDataFor<
  Q extends QueueName,
  J extends JobNameFor<Q>,
> = QueueJobMap[Q][J];

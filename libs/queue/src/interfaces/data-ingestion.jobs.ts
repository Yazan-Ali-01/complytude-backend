export const INGESTION_JOB_NAMES = {
  DOCUMENT_INGESTION: 'document-ingestion',
  RULESET_INGESTION: 'ruleset-ingestion',
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

export interface RulesetIngestionJobData {
  rulesetId: string;
  versionId: string;
}

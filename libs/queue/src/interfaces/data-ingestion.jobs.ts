export const INGESTION_JOB_NAMES = {
  DOCUMENT_INGESTION: 'document-ingestion',
  RULESET_INGESTION: 'ruleset-ingestion',
} as const;

export type IngestionJobName =
  (typeof INGESTION_JOB_NAMES)[keyof typeof INGESTION_JOB_NAMES];

export type DocumentSourceType = 'text_input' | 'file_upload' | 'generated';

export type ExtractionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface DocumentIngestionJobData {
  tenantId: string;
  documentId: string;
  s3Key: string;
  s3Bucket: string;
  originalFilename: string;
  mimeType: string;
}

export interface RulesetIngestionJobData {
  rulesetId: string;
  versionId: string;
}

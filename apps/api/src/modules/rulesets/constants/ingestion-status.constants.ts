/**
 * Ingestion job status for ruleset create/version/rollback responses.
 * Used for Swagger enum and type derivation.
 */
export const INGESTION_STATUSES = ['enqueued', 'failed'] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

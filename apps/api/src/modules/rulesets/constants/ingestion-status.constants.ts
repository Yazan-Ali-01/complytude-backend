/**
 * Whether the ingestion job was enqueued, on ruleset create/version/rollback responses (the
 * version's own state is its `ingestionStatus`). Used for Swagger enum and type derivation.
 */
export const INGESTION_JOB_OUTCOMES = ['enqueued', 'failed'] as const;
export type IngestionJobOutcome = (typeof INGESTION_JOB_OUTCOMES)[number];

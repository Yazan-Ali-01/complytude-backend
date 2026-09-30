export const GENERATION_JOB_NAMES = {
  DOCUMENT_GENERATION: 'document-generation',
} as const;

export type GenerationJobName =
  (typeof GENERATION_JOB_NAMES)[keyof typeof GENERATION_JOB_NAMES];

/**
 * IDs only: the worker reads the variables (names, IDs, salaries) from the generation job row,
 * so they never sit in Redis, where a failed job's payload stays for 7 days and Bull Board shows it.
 */
export interface DocumentGenerationJobData {
  generationJobId: string;
  templateId: string;
  templateVersionId: string;
  templateVersion: string;
  tenantId: string;
  userId: string;
  jobType: 'preview' | 'generate';
}

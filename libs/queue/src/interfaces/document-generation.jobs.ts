export const GENERATION_JOB_NAMES = {
  DOCUMENT_GENERATION: 'document-generation',
} as const;

export type GenerationJobName =
  (typeof GENERATION_JOB_NAMES)[keyof typeof GENERATION_JOB_NAMES];

export interface DocumentGenerationJobData {
  generationJobId: string;
  templateId: string;
  templateVersionId: string;
  variables: Record<string, unknown>;
  tenantId: string;
  userId: string;
  jobType: 'preview' | 'generate';
}

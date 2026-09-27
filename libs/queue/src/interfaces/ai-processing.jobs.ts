export const AI_JOB_NAMES = {
  TEMPLATE_ANALYSIS: 'template-analysis',
  ARABIC_TRANSLATION: 'arabic-translation',
  DOCUMENT_ANALYSIS: 'document-analysis',
} as const;

export type AiJobName = (typeof AI_JOB_NAMES)[keyof typeof AI_JOB_NAMES];

export interface TemplateAnalysisJobData {
  tenantId: string;
  templateId: string;
  templateVersionId: string;
  s3Key: string;
}

export interface ArabicTranslationJobData {
  tenantId: string;
  documentId: string;
  changedBlockIds: string[];
}

export interface DocumentAnalysisJobData {
  analysisJobId: string;
  documentId: string;
  tenantId: string;
  /** When present, restrict RAG retrieval to chunks from these rulesets only. */
  rulesetIds?: string[];
}

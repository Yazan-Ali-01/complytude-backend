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

/**
 * Where a contract is governed: which rules apply depends on it (federal labour law and the
 * PDPL don't apply in the DIFC or ADGM, which have their own). Rulesets are tagged with these codes.
 */
export const ANALYSIS_JURISDICTIONS = {
  MAINLAND: 'UAE mainland (onshore)',
  DMCC: 'Dubai Multi Commodities Centre (DMCC) free zone',
  IFZA: 'International Free Zone Authority (IFZA)',
  RAKEZ: 'Ras Al Khaimah Economic Zone (RAKEZ)',
  SHAMS: 'Sharjah Media City (SHAMS) free zone',
  DAFZA: 'Dubai Airport Free Zone (DAFZA)',
  JAFZA: 'Jebel Ali Free Zone (JAFZA)',
  DIFC: 'Dubai International Financial Centre (DIFC)',
  ADGM: 'Abu Dhabi Global Market (ADGM)',
} as const;

export type AnalysisJurisdiction = keyof typeof ANALYSIS_JURISDICTIONS;

/** What kind of contract it is: which rulesets apply depends on it too. */
export const ANALYSIS_DOCUMENT_TYPES = {
  employment: 'employment contract',
  shareholders_agreement: "shareholders' agreement",
  services: 'services agreement',
  data_processing: 'data processing agreement',
  commercial: 'commercial contract',
} as const;

export type AnalysisDocumentType = keyof typeof ANALYSIS_DOCUMENT_TYPES;

export interface DocumentAnalysisJobData {
  analysisJobId: string;
  documentId: string;
  tenantId: string;
  /** The rulesets that apply to this contract; retrieval searches only these. */
  rulesetIds?: string[];
  /** What the user said the contract is, told to the model (not document text). */
  jurisdiction?: AnalysisJurisdiction;
  documentType?: AnalysisDocumentType;
}

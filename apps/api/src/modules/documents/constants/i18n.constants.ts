/**
 * Documents module i18n translation keys
 */
export const DocumentsI18n = {
  errors: {
    DOCUMENT_NOT_FOUND: 'documents.errors.DOCUMENT_NOT_FOUND',
    ANALYSIS_JOB_NOT_FOUND: 'documents.errors.ANALYSIS_JOB_NOT_FOUND',
    NO_ANALYSIS_JOB_FOR_DOCUMENT:
      'documents.errors.NO_ANALYSIS_JOB_FOR_DOCUMENT',
    FILE_SIZE_EXCEEDS_LIMIT: 'documents.errors.FILE_SIZE_EXCEEDS_LIMIT',
    UPLOAD_URL_GENERATION_FAILED:
      'documents.errors.UPLOAD_URL_GENERATION_FAILED',
    INVALID_DOCUMENT_TYPE: 'documents.errors.INVALID_DOCUMENT_TYPE',
    UPLOAD_ALREADY_CONFIRMED: 'documents.errors.UPLOAD_ALREADY_CONFIRMED',
    FILE_NOT_UPLOADED: 'documents.errors.FILE_NOT_UPLOADED',
    FILE_SIZE_MISMATCH: 'documents.errors.FILE_SIZE_MISMATCH',
    DOCUMENT_LIST_FAILED: 'documents.errors.DOCUMENT_LIST_FAILED',
    DOCUMENT_RETRIEVAL_FAILED: 'documents.errors.DOCUMENT_RETRIEVAL_FAILED',
    DOCUMENT_DELETE_FAILED: 'documents.errors.DOCUMENT_DELETE_FAILED',
    DOCUMENT_NOT_EXTRACTED: 'documents.errors.DOCUMENT_NOT_EXTRACTED',
    GENERATION_CONTEXT_FAILED: 'documents.errors.GENERATION_CONTEXT_FAILED',
  },
  messages: {
    UPLOAD_CONFIRMED: 'documents.messages.UPLOAD_CONFIRMED',
    DOCUMENT_DELETED: 'documents.messages.DOCUMENT_DELETED',
  },
} as const;

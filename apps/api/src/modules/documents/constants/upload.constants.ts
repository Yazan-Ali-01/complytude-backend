/**
 * Hard ceiling for file uploads. Used by:
 * - DTO: @Max() decorator (compile-time validation)
 * - Service: runtime fallback when MAX_FILE_SIZE env var is unset
 *
 * The env var can set a LOWER limit (e.g. 10 MB for a starter plan),
 * but never exceed this ceiling.
 */
export const UPLOAD_MAX_FILE_SIZE_BYTES = 26_214_400; // 25 MB

export const ALLOWED_UPLOAD_CONTENT_TYPES = ['application/pdf'] as const;
export type AllowedUploadContentType =
  (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

export interface JobMetadata {
  traceId?: string;
  tenantId?: string;
  queuedAt: string; // ISO 8601
}

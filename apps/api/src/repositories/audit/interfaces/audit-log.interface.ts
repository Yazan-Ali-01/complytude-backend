export type AuditActorType = 'user' | 'system' | 'api_key';

export interface AuditLog {
  id: string;
  tenantId: string | null;
  actorId: string | null;
  actorType: AuditActorType;
  userRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  aiModelUsed: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  traceId: string | null;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  tenantId?: string;
  actorId?: string;
  actorType?: AuditActorType;
  userRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  aiModelUsed?: string;
  ipAddress?: string;
  userAgent?: string;
  traceId?: string;
}

export interface AuditLogFilters {
  startDate?: Date;
  endDate?: Date;
  action?: string;
  resourceType?: string;
  actorType?: AuditActorType;
  traceId?: string;
  limit?: number;
  offset?: number;
}

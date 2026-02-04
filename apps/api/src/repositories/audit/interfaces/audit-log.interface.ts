export interface AuditLog {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  aiModelUsed: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  tenantId?: string;
  userId?: string;
  userRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  aiModelUsed?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilters {
  startDate?: Date;
  endDate?: Date;
  action?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}

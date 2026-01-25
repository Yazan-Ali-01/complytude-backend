export interface AuditLog {
  id: string;
  user_id: string;
  tenant_id: string;
  role_name: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ai_model_used: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export type CreateAuditLogRow = Omit<
  AuditLog,
  'id' | 'created_at'
>;

export interface AuditLogQueryOptions {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  action?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}
export type TenantRole = 'tenant_admin' | 'legal_counsel' | 'member' | 'viewer';

export type PermissionKey =
  | 'documents:create'
  | 'documents:read'
  | 'documents:delete'
  | 'contracts:analyze'
  | 'contracts:redline'
  | 'templates:manage'
  | 'templates:use'
  | 'regulatory:query'
  | 'billing:manage'
  | 'team:manage'
  | 'settings:manage'
  | 'settings:change_jurisdiction'
  | 'pii:view_unmasked'
  | 'ai:use_premium_models';

export interface RbacAuditLog {
  id: string;
  user_id: string;
  tenant_id: string;
  role: TenantRole;
  action: string;
  resource_type?: string;
  resource_id?: string;
  granted: boolean;
  ai_model_used?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

export interface PermissionCheckLog {
  userId: string;
  tenantId: string;
  role: TenantRole;
  action: string;
  resourceType?: string;
  resourceId?: string;
  granted: boolean;
  aiModelUsed?: string;
  metadata?: Record<string, unknown>;
}

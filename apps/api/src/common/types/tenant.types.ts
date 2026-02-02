export enum TenantRole {
  TENANT_ADMIN = 'tenant_admin',
  LEGAL_COUNSEL = 'legal_counsel',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export type Permission =
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
  | 'settings:change_jurisdiction';

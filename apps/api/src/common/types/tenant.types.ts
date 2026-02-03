// System tenant roles (for autocomplete and type safety)
export enum SystemTenantRole {
  TENANT_ADMIN = 'tenant_admin',
  LEGAL_COUNSEL = 'legal_counsel',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

// Helper to check if a role is a system role
export function isTenantSystemRole(role: string): role is SystemTenantRole {
  return Object.values(SystemTenantRole).includes(role as SystemTenantRole);
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

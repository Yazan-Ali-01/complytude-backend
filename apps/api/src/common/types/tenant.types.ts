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

/**
 * Tenant-level permission type
 * Supports both concrete permissions and wildcard patterns
 * For platform-level permissions, see PlatformPermission (future)
 */
export type TenantPermission =
  // Documents
  | 'documents:create'
  | 'documents:read'
  | 'documents:delete'
  | 'documents:*'
  // Contracts
  | 'contracts:analyze'
  | 'contracts:redline'
  | 'contracts:*'
  // Templates
  | 'templates:manage'
  | 'templates:use'
  | 'templates:*'
  // Regulatory
  | 'regulatory:query'
  | 'regulatory:*'
  // Billing
  | 'billing:manage'
  | 'billing:*'
  // Team
  | 'team:manage'
  | 'team:*'
  // Settings
  | 'settings:manage'
  | 'settings:change_jurisdiction'
  | 'settings:*'
  // Cross-resource wildcards
  | '*:read'
  | '*:manage'
  | '*:*';

/**
 * Tenant-level RBAC permissions
 * These permissions are scoped to tenant operations and resources.
 * For platform-level permissions, see platform-permissions.constant.ts (future)
 */

export const TENANT_PERMISSIONS = {
  DOCUMENTS: {
    CREATE: 'documents:create',
    READ: 'documents:read',
    DELETE: 'documents:delete',
    ALL: 'documents:*', // Wildcard - all document permissions
  },
  CONTRACTS: {
    ANALYZE: 'contracts:analyze',
    REDLINE: 'contracts:redline',
    ALL: 'contracts:*', // Wildcard - all contract permissions
  },
  TEMPLATES: {
    MANAGE: 'templates:manage',
    USE: 'templates:use',
    ALL: 'templates:*', // Wildcard - all template permissions
  },
  REGULATORY: {
    QUERY: 'regulatory:query',
    ALL: 'regulatory:*', // Wildcard - all regulatory permissions
  },
  BILLING: {
    MANAGE: 'billing:manage',
    ALL: 'billing:*', // Wildcard - all billing permissions
  },
  TEAM: {
    MANAGE: 'team:manage',
    ALL: 'team:*', // Wildcard - all team permissions
  },
  SETTINGS: {
    MANAGE: 'settings:manage',
    CHANGE_JURISDICTION: 'settings:change_jurisdiction',
    ALL: 'settings:*', // Wildcard - all settings permissions
  },
  // Cross-resource wildcards
  WILDCARDS: {
    READ_ALL: '*:read', // All read permissions across resources
    MANAGE_ALL: '*:manage', // All manage permissions across resources
    ALL: '*:*', // All permissions (tenant_admin)
  },
} as const;

/**
 * All concrete tenant permissions (no wildcards)
 * Used for wildcard expansion and validation
 */
export const ALL_TENANT_PERMISSIONS = [
  'documents:create',
  'documents:read',
  'documents:delete',
  'contracts:analyze',
  'contracts:redline',
  'templates:manage',
  'templates:use',
  'regulatory:query',
  'billing:manage',
  'team:manage',
  'settings:manage',
  'settings:change_jurisdiction',
] as const;

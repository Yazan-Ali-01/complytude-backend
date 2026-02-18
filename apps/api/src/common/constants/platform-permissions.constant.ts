/**
 * Platform-level RBAC permissions
 * Scoped to platform-wide operations (identity token).
 * Mirrors tenant-permissions pattern.
 *
 * Architecture:
 * 1. ALL_PLATFORM_PERMISSIONS array is the single source of truth
 * 2. PlatformPermission type is derived from the array
 * 3. PLATFORM_PERMISSIONS object provides autocomplete grouping
 */

/**
 * All platform permissions including wildcards
 * Single source of truth - used by sync service and type derivation
 *
 * IMPORTANT: This array must NEVER be empty. The sync service has a safeguard
 * that will throw an error if this array is empty.
 */
export const ALL_PLATFORM_PERMISSIONS = [
  // Tenants
  'tenants:create',
  'tenants:read',
  'tenants:update',
  'tenants:delete',
  'tenants:*',
  // Users
  'users:read',
  'users:update',
  'users:delete',
  'users:manage_roles',
  'users:*',
  // Plans & Subscriptions
  'plans:read',
  'plans:manage',
  'plans:*',
  'subscriptions:read',
  'subscriptions:manage',
  'subscriptions:*',
  // Templates (global management)
  'templates:read',
  'templates:manage',
  'templates:*',
  // Rulesets
  'rulesets:read',
  'rulesets:manage',
  'rulesets:*',
  // Authorities
  'authorities:read',
  'authorities:manage',
  'authorities:*',
  // Categories
  'categories:read',
  'categories:manage',
  'categories:*',
  // Entitlements
  'entitlements:read',
  'entitlements:manage',
  'entitlements:*',
  // Audit
  'audit:read',
  'audit:*',
  // Support
  'support:access',
  'support:impersonate',
  'support:*',
  // Cross-resource wildcards
  '*:read',
  '*:manage',
  '*:*',
] as const;

export type PlatformPermission = (typeof ALL_PLATFORM_PERMISSIONS)[number];

/**
 * Grouped permission constants for autocomplete
 */
export const PLATFORM_PERMISSIONS = {
  TENANTS: {
    CREATE: 'tenants:create' as const,
    READ: 'tenants:read' as const,
    UPDATE: 'tenants:update' as const,
    DELETE: 'tenants:delete' as const,
    ALL: 'tenants:*' as const,
  },
  USERS: {
    READ: 'users:read' as const,
    UPDATE: 'users:update' as const,
    DELETE: 'users:delete' as const,
    MANAGE_ROLES: 'users:manage_roles' as const,
    ALL: 'users:*' as const,
  },
  PLANS: {
    READ: 'plans:read' as const,
    MANAGE: 'plans:manage' as const,
    ALL: 'plans:*' as const,
  },
  SUBSCRIPTIONS: {
    READ: 'subscriptions:read' as const,
    MANAGE: 'subscriptions:manage' as const,
    ALL: 'subscriptions:*' as const,
  },
  TEMPLATES: {
    READ: 'templates:read' as const,
    MANAGE: 'templates:manage' as const,
    ALL: 'templates:*' as const,
  },
  RULESETS: {
    READ: 'rulesets:read' as const,
    MANAGE: 'rulesets:manage' as const,
    ALL: 'rulesets:*' as const,
  },
  AUTHORITIES: {
    READ: 'authorities:read' as const,
    MANAGE: 'authorities:manage' as const,
    ALL: 'authorities:*' as const,
  },
  CATEGORIES: {
    READ: 'categories:read' as const,
    MANAGE: 'categories:manage' as const,
    ALL: 'categories:*' as const,
  },
  ENTITLEMENTS: {
    READ: 'entitlements:read' as const,
    MANAGE: 'entitlements:manage' as const,
    ALL: 'entitlements:*' as const,
  },
  AUDIT: {
    READ: 'audit:read' as const,
    ALL: 'audit:*' as const,
  },
  SUPPORT: {
    ACCESS: 'support:access' as const,
    IMPERSONATE: 'support:impersonate' as const,
    ALL: 'support:*' as const,
  },
  WILDCARDS: {
    READ_ALL: '*:read' as const,
    MANAGE_ALL: '*:manage' as const,
    ALL: '*:*' as const,
  },
} as const;

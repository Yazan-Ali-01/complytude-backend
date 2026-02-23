/**
 * Platform-level RBAC permissions
 * Scoped to platform-wide operations (identity token).
 * Mirrors tenant-permissions pattern.
 *
 * Architecture:
 * 1. PLATFORM_PERMISSIONS object is the single source of truth
 * 2. ALL_PLATFORM_PERMISSIONS array is derived from the object
 * 3. PlatformPermission type is derived from the object values
 */

/**
 * Grouped permission constants - SINGLE SOURCE OF TRUTH
 * All permissions are defined here with nice autocomplete grouping
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
  ADDONS: {
    READ: 'addons:read' as const,
    MANAGE: 'addons:manage' as const,
    ALL: 'addons:*' as const,
  },
} as const;

/**
 * Extract all permission values from nested PLATFORM_PERMISSIONS object
 * This type helper recursively extracts all string literal values
 */
type ExtractPermissionValues<T> =
  T extends Record<string, unknown>
    ? {
        [K in keyof T]: T[K] extends string
          ? T[K]
          : T[K] extends Record<string, unknown>
            ? ExtractPermissionValues<T[K]>
            : never;
      }[keyof T]
    : never;

/**
 * Platform permission type derived from PLATFORM_PERMISSIONS object
 */
export type PlatformPermission = ExtractPermissionValues<
  typeof PLATFORM_PERMISSIONS
>;

/**
 * All platform permissions as an array - derived from PLATFORM_PERMISSIONS object
 * Used by sync service for database synchronization
 *
 * IMPORTANT: This array is automatically derived from PLATFORM_PERMISSIONS.
 * Do not modify this array directly - add permissions to PLATFORM_PERMISSIONS instead.
 */
export const ALL_PLATFORM_PERMISSIONS: readonly PlatformPermission[] =
  Object.values(PLATFORM_PERMISSIONS).flatMap((category) =>
    Object.values(category),
  );

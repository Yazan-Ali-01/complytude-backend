/**
 * Tenant-level RBAC permissions
 * These permissions are scoped to tenant operations and resources.
 * For platform-level permissions, see platform-permissions.constant.ts
 *
 * Architecture:
 * 1. TENANT_PERMISSIONS object is the single source of truth
 * 2. ALL_TENANT_PERMISSIONS array is derived from the object
 * 3. TenantPermission type is derived from the object values
 *
 * Permission Taxonomy:
 * - CRUD actions: create, read, update, delete (for data entities)
 * - Specialized actions: manage (full control), use (consume/apply), query (read-only search)
 * - Domain actions: analyze, redline (AI-powered operations)
 *
 * Note: Documents are immutable after generation (no update permission).
 * To modify, users regenerate from template with new parameters.
 */

/**
 * Grouped permission constants - SINGLE SOURCE OF TRUTH
 * All permissions are defined here with nice autocomplete grouping
 */
export const TENANT_PERMISSIONS = {
  DOCUMENTS: {
    CREATE: 'documents:create' as const,
    READ: 'documents:read' as const,
    DELETE: 'documents:delete' as const,
    ALL: 'documents:*' as const,
  },
  CONTRACTS: {
    ANALYZE: 'contracts:analyze' as const,
    REDLINE: 'contracts:redline' as const,
    ALL: 'contracts:*' as const,
  },
  TEMPLATES: {
    MANAGE: 'templates:manage' as const,
    USE: 'templates:use' as const,
    ALL: 'templates:*' as const,
  },
  REGULATORY: {
    QUERY: 'regulatory:query' as const,
    ALL: 'regulatory:*' as const,
  },
  BILLING: {
    MANAGE: 'billing:manage' as const,
    ALL: 'billing:*' as const,
  },
  TEAM: {
    MANAGE: 'team:manage' as const,
    ALL: 'team:*' as const,
  },
  SETTINGS: {
    MANAGE: 'settings:manage' as const,
    CHANGE_JURISDICTION: 'settings:change_jurisdiction' as const,
    ALL: 'settings:*' as const,
  },
  SESSIONS: {
    MANAGE: 'sessions:manage' as const,
    ALL: 'sessions:*' as const,
  },
  // Cross-resource wildcards
  WILDCARDS: {
    READ_ALL: '*:read' as const,
    MANAGE_ALL: '*:manage' as const,
    ALL: '*:*' as const,
  },
} as const;

/**
 * Extract all permission values from nested TENANT_PERMISSIONS object
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
 * Tenant permission type derived from TENANT_PERMISSIONS object
 * Supports both concrete permissions and wildcard patterns
 *
 * Permission format: `resource:action`
 * - resource: The entity type (documents, contracts, templates, etc.)
 * - action: The operation (create, read, delete, manage, etc.)
 *
 * Wildcards:
 * - `resource:*` - All actions on a specific resource
 * - `*:action` - Specific action on all resources
 * - `*:*` - Full access (tenant_admin only)
 */
export type TenantPermission = ExtractPermissionValues<
  typeof TENANT_PERMISSIONS
>;

/**
 * All tenant permissions as an array - derived from TENANT_PERMISSIONS object
 * Used by sync service for database synchronization
 *
 * IMPORTANT: This array is automatically derived from TENANT_PERMISSIONS.
 * Do not modify this array directly - add permissions to TENANT_PERMISSIONS instead.
 */
export const ALL_TENANT_PERMISSIONS: readonly TenantPermission[] =
  Object.values(TENANT_PERMISSIONS).flatMap((category) =>
    Object.values(category),
  );

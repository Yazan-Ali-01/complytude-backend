/**
 * Tenant-level RBAC permissions
 * These permissions are scoped to tenant operations and resources.
 * For platform-level permissions, see platform-permissions.constant.ts (future)
 *
 * Architecture:
 * 1. ALL_TENANT_PERMISSIONS array is the single source of truth
 * 2. TenantPermission type is derived from the array
 * 3. TENANT_PERMISSIONS object provides nice autocomplete grouping
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
 * All tenant permissions including wildcards
 * This is the single source of truth - used by sync service and type derivation
 *
 * IMPORTANT: This array must NEVER be empty. The sync service has a safeguard
 * that will throw an error if this array is empty to prevent accidental
 * deletion of all permissions from the database.
 */
export const ALL_TENANT_PERMISSIONS = [
  // ─────────────────────────────────────────────────────────────────
  // Documents - Document repository operations
  // Note: Documents are immutable - no 'update' permission by design.
  // Users regenerate documents from templates with new parameters.
  // ─────────────────────────────────────────────────────────────────
  'documents:create',
  'documents:read',
  'documents:delete',
  'documents:*', // Wildcard: All document permissions

  // ─────────────────────────────────────────────────────────────────
  // Contracts - AI-powered contract operations
  // ─────────────────────────────────────────────────────────────────
  'contracts:analyze',
  'contracts:redline',
  'contracts:*', // Wildcard: All contract permissions

  // ─────────────────────────────────────────────────────────────────
  // Templates - Document template management
  // ─────────────────────────────────────────────────────────────────
  'templates:manage',
  'templates:use',
  'templates:*', // Wildcard: All template permissions

  // ─────────────────────────────────────────────────────────────────
  // Regulatory - Regulatory hub access
  // ─────────────────────────────────────────────────────────────────
  'regulatory:query',
  'regulatory:*', // Wildcard: All regulatory permissions

  // ─────────────────────────────────────────────────────────────────
  // Billing - Subscription and payment management
  // ─────────────────────────────────────────────────────────────────
  'billing:manage',
  'billing:*', // Wildcard: All billing permissions

  // ─────────────────────────────────────────────────────────────────
  // Team - Team member management
  // ─────────────────────────────────────────────────────────────────
  'team:manage',
  'team:*', // Wildcard: All team permissions

  // ─────────────────────────────────────────────────────────────────
  // Settings - Tenant configuration
  // ─────────────────────────────────────────────────────────────────
  'settings:manage',
  'settings:change_jurisdiction',
  'settings:*', // Wildcard: All settings permissions

  // ─────────────────────────────────────────────────────────────────
  // Sessions - User session management
  // ─────────────────────────────────────────────────────────────────
  'sessions:manage', // View and manage user sessions (tenant admin)
  'sessions:*', // Wildcard: All session permissions

  // ─────────────────────────────────────────────────────────────────
  // Cross-resource wildcards
  // ─────────────────────────────────────────────────────────────────
  '*:read', // All read permissions across resources
  '*:manage', // All manage permissions across resources
  '*:*', // Full access - all permissions (tenant_admin)
] as const;

/**
 * Tenant permission type derived from ALL_TENANT_PERMISSIONS array
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
export type TenantPermission = (typeof ALL_TENANT_PERMISSIONS)[number];

/**
 * Grouped permission constants for nice autocomplete in code
 * All values must be valid TenantPermission types
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

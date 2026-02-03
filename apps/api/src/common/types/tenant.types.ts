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
export type TenantPermission =
  // ─────────────────────────────────────────────────────────────────
  // Documents - Document repository operations
  // ─────────────────────────────────────────────────────────────────
  /** Create new documents from templates */
  | 'documents:create'
  /** View and download documents */
  | 'documents:read'
  /** Delete documents from repository */
  | 'documents:delete'
  /** Wildcard: All document permissions */
  | 'documents:*'

  // ─────────────────────────────────────────────────────────────────
  // Contracts - AI-powered contract operations
  // ─────────────────────────────────────────────────────────────────
  /** Perform AI-powered contract analysis and risk assessment */
  | 'contracts:analyze'
  /** AI-assisted contract redlining and editing */
  | 'contracts:redline'
  /** Wildcard: All contract permissions */
  | 'contracts:*'

  // ─────────────────────────────────────────────────────────────────
  // Templates - Document template management
  // ─────────────────────────────────────────────────────────────────
  /** Create, edit, and manage document templates */
  | 'templates:manage'
  /** Use approved templates to generate documents */
  | 'templates:use'
  /** Wildcard: All template permissions */
  | 'templates:*'

  // ─────────────────────────────────────────────────────────────────
  // Regulatory - Regulatory hub access
  // ─────────────────────────────────────────────────────────────────
  /** Access and query regulatory information */
  | 'regulatory:query'
  /** Wildcard: All regulatory permissions */
  | 'regulatory:*'

  // ─────────────────────────────────────────────────────────────────
  // Billing - Subscription and payment management
  // ─────────────────────────────────────────────────────────────────
  /** Manage subscription, invoices, and payment methods */
  | 'billing:manage'
  /** Wildcard: All billing permissions */
  | 'billing:*'

  // ─────────────────────────────────────────────────────────────────
  // Team - Team member management
  // ─────────────────────────────────────────────────────────────────
  /** Invite, remove, and manage team members */
  | 'team:manage'
  /** Wildcard: All team permissions */
  | 'team:*'

  // ─────────────────────────────────────────────────────────────────
  // Settings - Tenant configuration
  // ─────────────────────────────────────────────────────────────────
  /** Manage tenant configuration and settings */
  | 'settings:manage'
  /** Change tenant jurisdiction (critical - affects legal logic) */
  | 'settings:change_jurisdiction'
  /** Wildcard: All settings permissions */
  | 'settings:*'

  // ─────────────────────────────────────────────────────────────────
  // Cross-resource wildcards
  // ─────────────────────────────────────────────────────────────────
  /** All read permissions across resources */
  | '*:read'
  /** All manage permissions across resources */
  | '*:manage'
  /** Full access - all permissions (tenant_admin only) */
  | '*:*';

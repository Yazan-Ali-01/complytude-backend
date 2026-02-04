import { SystemTenantRole, TenantPermission } from '../types';

/**
 * In-memory permission sets for tenant system roles
 * This eliminates database queries for system role permission checks
 *
 * System roles are predefined and cannot be modified by tenants.
 * Custom tenant roles (MVP+) will still query the database.
 *
 * Performance: O(1) lookup, no database query needed
 *
 * Architecture Change:
 * - Wildcards are now stored as real permissions in the database
 * - System roles can use wildcards for cleaner permission sets
 * - Permission matching still handles wildcard logic at runtime
 *
 * TODO: When tenants request their available roles, we also return system roles
 * from the database. The DB entries for system roles exist solely for that purpose
 * (UI display and role listing). Permission checks always use this in-memory map.
 */
export const TENANT_SYSTEM_ROLE_PERMISSIONS: Record<
  SystemTenantRole,
  ReadonlySet<TenantPermission>
> = {
  /**
   * Tenant Admin - Full access to all tenant features
   * Uses wildcard '*:*' to match any permission check
   */
  [SystemTenantRole.TENANT_ADMIN]: new Set(['*:*']),

  /**
   * Legal Counsel - Full AI drafting, risk analysis, redlining, and template management
   * Uses wildcards for documents, contracts, and templates for cleaner permission set
   */
  [SystemTenantRole.LEGAL_COUNSEL]: new Set([
    'documents:*', // All document permissions (create, read, delete)
    'contracts:*', // All contract permissions (analyze, redline)
    'templates:*', // All template permissions (manage, use)
    'regulatory:query', // Concrete permission
  ]),

  /**
   * Member - Use approved wizards and generate documents from approved templates
   * Limited to basic document creation and template usage
   */
  [SystemTenantRole.MEMBER]: new Set([
    'documents:create',
    'documents:read',
    'templates:use',
    'regulatory:query',
  ]),

  /**
   * Viewer - Read-only access to document repository
   * Can only view documents and query regulatory information
   */
  [SystemTenantRole.VIEWER]: new Set(['documents:read', 'regulatory:query']),
};

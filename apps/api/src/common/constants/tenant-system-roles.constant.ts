import { SystemTenantRole } from '../types';

/**
 * In-memory permission sets for tenant system roles
 * This eliminates database queries for system role permission checks
 *
 * System roles are predefined and cannot be modified by tenants.
 * Custom tenant roles (MVP+) will still query the database.
 *
 * Performance: O(1) lookup, no database query needed
 */
export const TENANT_SYSTEM_ROLE_PERMISSIONS: Record<
  SystemTenantRole,
  ReadonlySet<string>
> = {
  /**
   * Tenant Admin - Full access to all tenant features
   * Uses wildcard '*:*' to match any permission check
   */
  [SystemTenantRole.TENANT_ADMIN]: new Set(['*:*']),

  /**
   * Legal Counsel - Full AI drafting, risk analysis, redlining, and template management
   * Has wildcard access to documents, contracts, and templates
   */
  [SystemTenantRole.LEGAL_COUNSEL]: new Set([
    'documents:*', // All document permissions
    'contracts:*', // All contract permissions
    'templates:*', // All template permissions
    'regulatory:query',
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

/**
 * System tenant roles enum
 * For autocomplete and type safety
 */
export enum SystemTenantRole {
  TENANT_ADMIN = 'tenant_admin',
  LEGAL_COUNSEL = 'legal_counsel',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/**
 * Re-export TenantPermission type from constants
 * This eliminates duplicate type definitions
 */
export type { TenantPermission } from '../constants/tenant-permissions.constant';

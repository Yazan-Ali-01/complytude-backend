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
 * Helper to check if a role is a system role
 */
export function isTenantSystemRole(role: string): role is SystemTenantRole {
  return Object.values(SystemTenantRole).includes(role as SystemTenantRole);
}

/**
 * Re-export TenantPermission type from constants
 * This eliminates duplicate type definitions
 */
export type { TenantPermission } from '../constants/tenant-permissions.constant';

import { SystemTenantRole } from '../types/tenant.types';

/**
 * Helper to check if a role is a system role
 * @param role - Role key to check
 * @returns True if the role is a system role, false otherwise
 */
export function isTenantSystemRole(role: string): role is SystemTenantRole {
  return Object.values(SystemTenantRole).includes(role as SystemTenantRole);
}

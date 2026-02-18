import { SystemPlatformRole } from '../types/platform.types';

/**
 * Check if a role key is a system platform role
 * Mirrors isTenantSystemRole() pattern
 */
export function isPlatformSystemRole(role: string): role is SystemPlatformRole {
  return Object.values(SystemPlatformRole).includes(role as SystemPlatformRole);
}

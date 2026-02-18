/**
 * System platform roles enum
 * Mirrors SystemTenantRole pattern for platform-level RBAC
 * Values match DB platform_role_key VARCHAR column. Custom platform roles (future)
 * use other keys stored in the same column.
 */
export enum SystemPlatformRole {
  SYSTEM_ADMIN = 'system_admin',
  SUPPORT = 'support',
  AUDITOR = 'auditor',
}

/**
 * Re-export PlatformPermission type from constants
 */
export type { PlatformPermission } from '../constants/platform-permissions.constant';

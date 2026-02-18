import { SystemPlatformRole } from '../types/platform.types';
import type { PlatformPermission } from './platform-permissions.constant';

/**
 * In-memory permission sets for platform system roles
 * Mirrors TENANT_SYSTEM_ROLE_PERMISSIONS pattern exactly.
 *
 * System roles: In-memory O(1) lookup
 * Custom roles (future): Database query
 */
export const PLATFORM_SYSTEM_ROLE_PERMISSIONS: Record<
  SystemPlatformRole,
  ReadonlySet<PlatformPermission>
> = {
  [SystemPlatformRole.SYSTEM_ADMIN]: new Set(['*:*']),

  [SystemPlatformRole.SUPPORT]: new Set([
    'tenants:read',
    'users:read',
    'plans:read',
    'subscriptions:read',
    'templates:read',
    'rulesets:read',
    'authorities:read',
    'categories:read',
    'entitlements:read',
    'audit:read',
    'support:access',
  ]),

  [SystemPlatformRole.AUDITOR]: new Set([
    'tenants:read',
    'users:read',
    'audit:read',
    'entitlements:read',
  ]),
};

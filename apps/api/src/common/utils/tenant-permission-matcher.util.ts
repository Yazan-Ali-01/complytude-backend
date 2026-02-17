/**
 * Tenant-specific permission matching
 * Re-exports generic matcher with tenant-prefixed names
 */
export {
  matchPermission as matchTenantPermission,
  hasAllPermissions as hasAllTenantPermissions,
  hasAnyPermission as hasAnyTenantPermission,
} from './permission-matcher.util';

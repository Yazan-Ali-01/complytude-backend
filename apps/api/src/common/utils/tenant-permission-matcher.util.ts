import { ALL_TENANT_PERMISSIONS } from '../constants/tenant-permissions.constant';

/**
 * Check if a tenant permission pattern matches a required permission
 * Supports bidirectional wildcard matching:
 * - User has wildcard: 'documents:*' matches required 'documents:read'
 * - Required is wildcard: user's 'documents:read' matches required '*:read'
 *
 * @param userPermission - The permission pattern the user has (may include wildcards)
 * @param requiredPermission - The permission required for the operation (may include wildcards)
 * @returns true if the user's permission satisfies the required permission
 *
 * @example
 * // User has wildcard, required is concrete
 * matchTenantPermission('documents:*', 'documents:read') // true
 * matchTenantPermission('*:read', 'documents:read') // true
 * matchTenantPermission('*:*', 'documents:read') // true
 *
 * // User has concrete, required is wildcard
 * matchTenantPermission('documents:read', '*:read') // true
 * matchTenantPermission('documents:read', 'documents:*') // true
 * matchTenantPermission('documents:read', '*:*') // true
 *
 * // No match
 * matchTenantPermission('documents:create', 'documents:read') // false
 */
export function matchTenantPermission(
  userPermission: string,
  requiredPermission: string,
): boolean {
  // Exact match
  if (userPermission === requiredPermission) {
    return true;
  }

  // Split permissions into resource and action
  const [userResource, userAction] = userPermission.split(':');
  const [reqResource, reqAction] = requiredPermission.split(':');

  // Case 1: User has full wildcard '*:*' - matches any required permission
  if (userPermission === '*:*') {
    return true;
  }

  // Case 2: Required is full wildcard '*:*' - any user permission matches
  if (requiredPermission === '*:*') {
    return true;
  }

  // Case 3: User has resource wildcard 'documents:*' - matches any action on that resource
  // Example: user has 'documents:*', required is 'documents:read' → true
  if (userAction === '*' && userResource === reqResource) {
    return true;
  }

  // Case 4: Required is resource wildcard 'documents:*' - user must have any action on that resource
  // Example: user has 'documents:read', required is 'documents:*' → true
  if (reqAction === '*' && userResource === reqResource) {
    return true;
  }

  // Case 5: User has action wildcard '*:read' - matches that action on any resource
  // Example: user has '*:read', required is 'documents:read' → true
  if (userResource === '*' && userAction === reqAction) {
    return true;
  }

  // Case 6: Required is action wildcard '*:read' - user must have that action on any resource
  // Example: user has 'documents:read', required is '*:read' → true
  if (reqResource === '*' && userAction === reqAction) {
    return true;
  }

  return false;
}

/**
 * Expand a wildcard tenant permission to all concrete permissions it represents
 * Useful for displaying what permissions a wildcard grants
 *
 * @param permission - The permission pattern (may include wildcards)
 * @returns Array of concrete permission strings
 *
 * @example
 * expandTenantWildcard('documents:*')
 * // ['documents:create', 'documents:read', 'documents:delete']
 *
 * expandTenantWildcard('*:read')
 * // ['documents:read', 'templates:read', ...]
 *
 * expandTenantWildcard('*:*')
 * // All tenant permissions
 */
export function expandTenantWildcard(permission: string): string[] {
  // Full wildcard - return all permissions
  if (permission === '*:*') {
    return [...ALL_TENANT_PERMISSIONS];
  }

  const [resource, action] = permission.split(':');

  // Resource wildcard: 'documents:*'
  if (action === '*') {
    return ALL_TENANT_PERMISSIONS.filter((p) => p.startsWith(`${resource}:`));
  }

  // Action wildcard: '*:read'
  if (resource === '*') {
    return ALL_TENANT_PERMISSIONS.filter((p) => p.endsWith(`:${action}`));
  }

  // No wildcard - return as-is
  return [permission];
}

/**
 * Check if user permissions satisfy all required permissions (AND logic)
 * Normalizes wildcards in required permissions before checking
 *
 * @param userPermissions - Array of permissions the user has (may include wildcards)
 * @param requiredPermissions - Array of required permissions (may include wildcards)
 * @returns true if user has all required permissions
 *
 * @example
 * // User has concrete, required has wildcard
 * hasAllTenantPermissions(
 *   ['documents:read', 'documents:create'],
 *   ['documents:*']
 * ) // true - user has all document permissions
 *
 * // User has wildcard, required has concrete
 * hasAllTenantPermissions(
 *   ['documents:*'],
 *   ['documents:read', 'documents:create']
 * ) // true - wildcard covers both
 */
export function hasAllTenantPermissions(
  userPermissions: string[],
  requiredPermissions: string[],
): boolean {
  // Normalize required permissions (expand wildcards)
  const normalizedRequired = requiredPermissions.flatMap((p) =>
    expandTenantWildcard(p),
  );

  // Check if user has all normalized required permissions
  return normalizedRequired.every((required) =>
    userPermissions.some((userPerm) =>
      matchTenantPermission(userPerm, required),
    ),
  );
}

/**
 * Check if user permissions satisfy any required permission (OR logic)
 * Normalizes wildcards in required permissions before checking
 *
 * @param userPermissions - Array of permissions the user has (may include wildcards)
 * @param requiredPermissions - Array of required permissions (may include wildcards)
 * @returns true if user has at least one required permission
 *
 * @example
 * hasAnyTenantPermission(
 *   ['documents:read'],
 *   ['documents:*', 'templates:*']
 * ) // true - user's documents:read matches documents:*
 */
export function hasAnyTenantPermission(
  userPermissions: string[],
  requiredPermissions: string[],
): boolean {
  // Normalize required permissions (expand wildcards)
  const normalizedRequired = requiredPermissions.flatMap((p) =>
    expandTenantWildcard(p),
  );

  // Check if user has at least one normalized required permission
  return normalizedRequired.some((required) =>
    userPermissions.some((userPerm) =>
      matchTenantPermission(userPerm, required),
    ),
  );
}

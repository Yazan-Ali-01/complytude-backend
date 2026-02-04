/**
 * Check if a tenant permission pattern matches a required permission
 *
 * Mental Model (user permission expands to cover required):
 * - *:* → covers everything
 * - resource:* → covers all actions on one resource
 * - *:action → covers one action on all resources
 * - resource:action → covers one action on one resource
 *
 * @param userPermission - The permission the user has (may include wildcards)
 * @param requiredPermission - The permission required for the operation (concrete only)
 * @returns true if the user's permission covers the required permission
 *
 * @example
 * // User has wildcard, required is concrete
 * matchTenantPermission('*:*', 'documents:read') // true - covers everything
 * matchTenantPermission('documents:*', 'documents:read') // true - covers all document actions
 * matchTenantPermission('*:read', 'documents:read') // true - covers read on all resources
 * matchTenantPermission('documents:read', 'documents:read') // true - exact match
 *
 * // No match
 * matchTenantPermission('documents:read', 'documents:create') // false - different actions
 * matchTenantPermission('documents:read', 'contracts:read') // false - different resources
 * matchTenantPermission('documents:create', 'documents:*') // false - user doesn't have wildcard
 */
export function matchTenantPermission(
  userPermission: string,
  requiredPermission: string,
): boolean {
  // Exact match (covers both concrete and wildcard exact matches)
  if (userPermission === requiredPermission) {
    return true;
  }

  // Split permissions into resource and action
  const [userResource, userAction] = userPermission.split(':');
  const [reqResource, reqAction] = requiredPermission.split(':');

  // Case 1: User has full wildcard '*:*' - covers any required permission
  if (userPermission === '*:*') {
    return true;
  }

  // Case 2: User has resource wildcard 'documents:*' - covers any action on that resource
  // Example: user has 'documents:*', required is 'documents:read' → true
  if (userAction === '*' && userResource === reqResource) {
    return true;
  }

  // Case 3: User has action wildcard '*:read' - covers that action on any resource
  // Example: user has '*:read', required is 'documents:read' → true
  if (userResource === '*' && userAction === reqAction) {
    return true;
  }

  return false;
}

/**
 * Check if user permissions satisfy all required permissions (AND logic)
 * Direct matching without normalization - wildcards are now real permissions
 *
 * @param userPermissions - Array of permissions the user has (may include wildcards)
 * @param requiredPermissions - Array of required permissions (may include wildcards)
 * @returns true if user has all required permissions
 *
 * @example
 * // User has wildcard, required has concrete
 * hasAllTenantPermissions(
 *   ['documents:*'],
 *   ['documents:read', 'documents:create']
 * ) // true - wildcard covers both
 *
 * // User has concrete, required has concrete
 * hasAllTenantPermissions(
 *   ['documents:read', 'documents:create'],
 *   ['documents:read', 'documents:create']
 * ) // true - exact matches
 */
export function hasAllTenantPermissions(
  userPermissions: string[],
  requiredPermissions: string[],
): boolean {
  // Direct matching - no expansion needed
  // matchTenantPermission handles wildcard logic
  return requiredPermissions.every((required) =>
    userPermissions.some((userPerm) =>
      matchTenantPermission(userPerm, required),
    ),
  );
}

/**
 * Check if user permissions satisfy any required permission (OR logic)
 * Direct matching without normalization - wildcards are now real permissions
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
  // Direct matching - no expansion needed
  // matchTenantPermission handles wildcard logic
  return requiredPermissions.some((required) =>
    userPermissions.some((userPerm) =>
      matchTenantPermission(userPerm, required),
    ),
  );
}

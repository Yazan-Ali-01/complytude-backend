/**
 * Generic permission matching utilities
 * Used by both tenant-level and platform-level RBAC
 *
 * Wildcard model:
 * - *:* → covers everything
 * - resource:* → covers all actions on one resource
 * - *:action → covers one action on all resources
 * - resource:action → exact match only
 */
export function matchPermission(
  userPermission: string,
  requiredPermission: string,
): boolean {
  if (userPermission === requiredPermission) return true;
  const [userResource, userAction] = userPermission.split(':');
  const [reqResource, reqAction] = requiredPermission.split(':');
  if (userPermission === '*:*') return true;
  if (userAction === '*' && userResource === reqResource) return true;
  if (userResource === '*' && userAction === reqAction) return true;
  return false;
}

export function hasAllPermissions(
  userPermissions: string[],
  requiredPermissions: string[],
): boolean {
  return requiredPermissions.every((required) =>
    userPermissions.some((userPerm) => matchPermission(userPerm, required)),
  );
}

export function hasAnyPermission(
  userPermissions: string[],
  requiredPermissions: string[],
): boolean {
  return requiredPermissions.some((required) =>
    userPermissions.some((userPerm) => matchPermission(userPerm, required)),
  );
}

import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../../modules/rbac/types/rbac.types';

export const PERMISSIONS_KEY = 'permissions';

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

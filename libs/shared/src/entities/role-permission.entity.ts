import { TenantRole } from '../types/rbac.types';

export interface RolePermission {
  id: string;
  role: TenantRole;
  permission_key: string;
  created_at: Date;
}

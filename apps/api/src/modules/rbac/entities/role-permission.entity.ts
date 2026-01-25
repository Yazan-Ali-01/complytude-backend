export interface RolePermission {
  role_name: string;
  permission_id: string;
  granted_at: Date;
}

export type CreateRolePermissionRow = Omit<RolePermission, 'granted_at'>;

export interface PermissionWithDetails extends RolePermission {
  permission: {
    id: string;
    name: string;
    resource: string;
    action: string;
    description: string | null;
  };
}

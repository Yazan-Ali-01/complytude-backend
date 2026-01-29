export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export type CreatePermissionRow = Omit<
  Permission,
  'id' | 'created_at' | 'updated_at'
>;

export type UpdatePermissionRow = Partial<Pick<Permission, 'description'>>;

export interface Permission {
  id: string;
  key: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
  createdAt: Date;
}

export interface CreatePermissionInput {
  key: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
}

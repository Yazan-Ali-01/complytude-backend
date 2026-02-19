export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tenantId: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoleInput {
  key: string;
  name: string;
  description?: string;
  tenantId?: string;
  isSystem?: boolean;
  isActive?: boolean;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

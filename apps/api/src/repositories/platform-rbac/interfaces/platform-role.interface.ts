export interface PlatformRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlatformRoleInput {
  key: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  isActive?: boolean;
}

export interface UpdatePlatformRoleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

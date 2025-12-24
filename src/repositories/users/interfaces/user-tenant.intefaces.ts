export interface UserTenant {
  userId: string;
  tenantId: string;
  role: string;
  isActive: boolean;
  joinedAt: Date;
  updatedAt: Date | null;
  schemaName: string;
}

export interface UserTenantInfo extends UserTenant {
  email: string;
  firstName: string | null;
  lastName: string | null;
  isVerified: boolean;
  isSystemAdmin: boolean;
}

export interface LinkUserTenantInput {
  userId: string;
  tenantId: string;
  role: string;
  isActive?: boolean;
}

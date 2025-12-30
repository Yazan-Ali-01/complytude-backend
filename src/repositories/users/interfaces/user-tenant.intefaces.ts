import { UserTenant } from 'src/modules/users/entities/user-tenant.entity';

export interface UserTenantInfo extends UserTenant {
  schema_name: string;
}

export interface LinkUserTenantInput {
  userId: string;
  tenantId: string;
  role: string;
  isActive?: boolean;
}

export interface UserTenantWithUser extends UserTenant {
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_verified: boolean;
  is_system_admin: boolean;
  schema_name: string;
}

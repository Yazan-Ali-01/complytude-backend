import { UserTenant } from '../../../types/entities.js';

export interface LinkUserTenantInput {
  userId: string;
  tenantId: string;
  role: string;
  isActive?: boolean;
}

export interface UserTenantWithUserRow extends UserTenant {
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_verified: boolean;
  is_system_admin: boolean;
}

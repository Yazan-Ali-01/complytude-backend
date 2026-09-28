import { UserTenant } from 'src/modules/users/entities/user-tenant.entity';
import { SystemTenantRole } from '../../../common/types';

export interface LinkUserTenantInput {
  userId: string;
  tenantId: string;
  roleKey: SystemTenantRole;
  isActive?: boolean;
}

export interface UserTenantWithUserRow extends UserTenant {
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_verified: boolean;
  platform_role_key: string | null;
  /** tenants.is_active: false while a platform admin has the tenant deactivated */
  tenant_is_active: boolean;
}

import { PlanKey } from 'src/common/types/entitlement.types';

export interface Tenant {
  id: string; // Primary key (UUID) - this IS the tenant identifier
  plan: PlanKey;
  is_active: boolean;
  parent_tenant_id?: string;
  created_at: Date;
  updated_at: Date;
}

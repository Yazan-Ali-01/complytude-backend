import { TenantFeatures } from './tenant-features.interface';
import { AnyPlanTier } from 'src/common/types/plans';

export interface Tenant {
  id: string;
  plan: AnyPlanTier;
  features: TenantFeatures;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type { TenantFeatures } from './tenant-features.interface';

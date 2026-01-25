import { TenantFeatures } from './tenant-features.interface';
import { PlanTier } from '@complytude/shared';

export interface Tenant {
  id: string;
  plan: PlanTier;
  features: TenantFeatures;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type { TenantFeatures } from './tenant-features.interface';

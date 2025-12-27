import { TenantFeaturesDto } from 'src/modules/tenant/dto/create-tenant.dto';

export interface Tenant {
  id: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: TenantFeaturesDto;
  schema_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TenantSchema {
  tenant_id: string;
  schema_name: string;
  is_active: boolean;
  created_at: Date;
}

export interface CreateTenantInput {
  id: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: string;
  schema_name: string;
  is_active?: boolean;
}

export interface UpdateTenantInput {
  email?: string;
  role?: 'admin' | 'user' | 'viewer';
  plan?: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features?: TenantFeaturesDto;
  is_active?: boolean;
  updated_at?: Date;
}

/**
 * Shared entity interfaces for repositories
 * These define the minimal structure needed by the shared library repositories
 */

// TenantFeatures is the canonical source from tenant-features.interface.ts
// Re-export for backwards compatibility with repositories importing from entities
import type { TenantFeatures } from './tenant-features.interface.js';
export type { TenantFeatures };

export interface Authority {
  id: string;
  code: string;
  name: string;
  description: string | null;
  country: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Ruleset {
  id: string;
  key: string;
  name: string;
  description: string | null;
  authority_id: string | null;
  clauses: RulesetClause[];
  metadata: Record<string, any>;
  version: string;
  status: 'active' | 'inactive' | 'deprecated';
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RulesetWithClauses extends Ruleset {
  clauses: RulesetClause[];
}

export interface RulesetClause {
  id: string;
  title: string;
  content: string;
  order: number;
  is_required: boolean;
  metadata: Record<string, any> | null;
}

export interface Template {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category_id: string | null;
  authority_id: string | null;
  languages: string[];
  current_version: string;
  status: 'active' | 'inactive' | 'draft' | 'deprecated';
  file_url: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export type TemplateFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'email'
  | 'phone';

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: string;
  fields: TemplateField[];
  file_url: string;
  changelog: string | null;
  metadata: Record<string, any>;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
}

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  default_value?: any;
  placeholder?: string;
  help_text?: string;
  validation_rules?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: string;
  };
  options?: string[] | { label: string; value: string }[];
  order?: number;
}

export interface Tenant {
  id: string;
  plan: 'navigator' | 'shield' | 'general_counsel' | 'infrastructure';
  features: TenantFeatures;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  is_verified: boolean;
  is_system_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserTenant {
  user_id: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  joined_at: Date;
  updated_at: Date;
}

import { TemplateVersion } from '../../templates/entities/template-version.entity';

export interface Template {
  id: string;
  key: string;
  name: string;
  description?: string;
  category_id?: string;
  authority_id?: string;
  languages: string[];
  current_version: string;
  status: 'active' | 'inactive' | 'draft' | 'deprecated';
  file_url?: string;
  thumbnail_url?: string;
  metadata: Record<string, any>;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateWithDetails extends Template {
  category?: {
    id: string;
    code: string;
    name: string;
  };
  authority?: {
    id: string;
    code: string;
    name: string;
  };
  rulesets?: {
    id: string;
    key: string;
    name: string;
  }[];
  current_version_details?: TemplateVersion;
}
